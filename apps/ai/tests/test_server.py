import asyncio
import http.client
import json
import re
import socket
import threading
import time
from collections.abc import Callable
from pathlib import Path

import pytest
import uvicorn
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind

from app import server
from app.config.settings import Settings
from app.interpretation.structured_model_call import (
    MAX_OUTPUT_VALIDATION_ATTEMPTS,
    MODEL_CALL_TIMEOUT_SECONDS,
)
from app.main import create_app
from app.observability.telemetry_config import MAX_OTLP_TIMEOUT_SECONDS, load_telemetry_config
from app.observability.telemetry_runtime import (
    SHUTDOWN_EXPORT_WINDOW_SECONDS,
    build_telemetry_runtime,
)
from app.providers.model_provider import ModelIntentRequest, ModelIntentResult
from app.server import (
    APP_FACTORY,
    REQUEST_DRAIN_TIMEOUT_SECONDS,
    InvalidServerPortError,
    bind_dual_stack_socket,
    build_server,
    read_port,
)
from tests.conftest import AUTH_HEADERS
from tests.fakes import ScriptedModelProvider, interpreted_output
from tests.telemetry_fakes import ENABLED

STARTUP_TIMEOUT_SECONDS = 10
TEST_DRAIN_TIMEOUT_SECONDS = 0.2
RAILWAY_CONFIG = Path(__file__).resolve().parents[3] / ".railway" / "railway.ts"
AI_SERVICE_DRAINING = re.compile(r"service\('ai'.*?drainingSeconds:\s*(\d+)", re.DOTALL)
SERVER_ENV = {
    "AI_SERVICE_ENV": "production",
    "AI_SERVICE_TOKEN": "test-service-token-with-at-least-32-characters",
    "AI_PROVIDER": "disabled",
}


class RecordingSocket:
    def __init__(self, family: int, kind: int) -> None:
        self.family = family
        self.kind = kind
        self.options: dict[tuple[int, int], int] = {}
        self.address: tuple[str, int] | None = None
        self.closed = False

    def setsockopt(self, level: int, option: int, value: int) -> None:
        self.options[(level, option)] = value

    def bind(self, address: tuple[str, int]) -> None:
        self.address = address

    def close(self) -> None:
        self.closed = True


class FailingBindSocket(RecordingSocket):
    def bind(self, address: tuple[str, int]) -> None:
        raise OSError("address in use")


class GatedModelProvider(ScriptedModelProvider):
    def __init__(self) -> None:
        super().__init__([interpreted_output()])
        self.entered = threading.Event()
        self.release = threading.Event()

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        self.entered.set()
        await asyncio.to_thread(self.release.wait, STARTUP_TIMEOUT_SECONDS)
        return await super().generate_intent(request)


class HangingModelProvider(ScriptedModelProvider):
    def __init__(self, events: list[str]) -> None:
        super().__init__([])
        self.entered = threading.Event()
        self._events = events

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        self.entered.set()
        try:
            await asyncio.get_running_loop().create_future()
        except asyncio.CancelledError:
            self._events.append("model call cancelled")
            raise
        raise AssertionError("the model call must not complete")


class ShutdownRecordingExporter(InMemorySpanExporter):
    def __init__(self, events: list[str]) -> None:
        super().__init__()
        self._events = events
        self.on_shutdown: Callable[[], None] = lambda: None

    def shutdown(self) -> None:
        self._events.append("telemetry shutdown")
        self.on_shutdown()
        super().shutdown()


def test_port_comes_from_the_environment() -> None:
    assert read_port({"PORT": "8000"}) == 8000
    assert read_port({"PORT": " 8123 "}) == 8123


@pytest.mark.parametrize("value", [None, "", " ", "abc", "80.5", "-1", "0", "65536"])
def test_missing_or_invalid_port_is_rejected(value: str | None) -> None:
    environ = {} if value is None else {"PORT": value}

    with pytest.raises(InvalidServerPortError, match="PORT must be an integer"):
        read_port(environ)


def test_socket_is_explicitly_dual_stack(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(server.socket, "socket", RecordingSocket)

    bound = bind_dual_stack_socket(8000)

    assert isinstance(bound, RecordingSocket)
    assert bound.family == socket.AF_INET6
    assert bound.kind == socket.SOCK_STREAM
    assert bound.options[(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY)] == 0
    assert bound.options[(socket.SOL_SOCKET, socket.SO_REUSEADDR)] == 1
    assert bound.address == ("::", 8000)
    assert not bound.closed


def test_socket_is_closed_when_binding_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    created: list[FailingBindSocket] = []

    def create(family: int, kind: int) -> FailingBindSocket:
        created.append(FailingBindSocket(family, kind))
        return created[-1]

    monkeypatch.setattr(server.socket, "socket", create)

    with pytest.raises(OSError, match="address in use"):
        bind_dual_stack_socket(8000)
    assert created[0].closed


def test_server_runs_the_existing_application_factory() -> None:
    config = build_server().config

    assert config.app == APP_FACTORY == "app.main:create_app"
    assert config.factory is True
    assert config.workers in (None, 1)
    assert config.timeout_graceful_shutdown == REQUEST_DRAIN_TIMEOUT_SECONDS


def test_shutdown_budget_fits_inside_the_railway_draining_window() -> None:
    match = AI_SERVICE_DRAINING.search(RAILWAY_CONFIG.read_text())
    assert match, "drainingSeconds for the ai service not found in .railway/railway.ts"
    draining_seconds = int(match.group(1))
    longest_request = MAX_OUTPUT_VALIDATION_ATTEMPTS * MODEL_CALL_TIMEOUT_SECONDS
    telemetry_shutdown = SHUTDOWN_EXPORT_WINDOW_SECONDS + MAX_OTLP_TIMEOUT_SECONDS

    assert longest_request < REQUEST_DRAIN_TIMEOUT_SECONDS
    assert REQUEST_DRAIN_TIMEOUT_SECONDS + telemetry_shutdown < draining_seconds


def test_in_flight_request_completes_before_its_spans_are_flushed_at_shutdown(
    settings: Settings,
) -> None:
    exporter = InMemorySpanExporter()
    runtime = build_telemetry_runtime(
        load_telemetry_config(ENABLED), "development", span_exporter=exporter
    )
    provider = GatedModelProvider()
    app = create_app(settings, provider, telemetry=runtime)
    server_socket = socket.socket()
    server_socket.bind(("127.0.0.1", 0))
    port = server_socket.getsockname()[1]
    uvicorn_server = uvicorn.Server(
        uvicorn.Config(
            app, timeout_graceful_shutdown=REQUEST_DRAIN_TIMEOUT_SECONDS, log_level="warning"
        )
    )
    server_thread = threading.Thread(target=uvicorn_server.run, kwargs={"sockets": [server_socket]})
    responses: list[tuple[int, bytes]] = []
    client_thread = threading.Thread(target=lambda: responses.append(_post_interpret(port)))

    server_thread.start()
    try:
        _wait_until(lambda: uvicorn_server.started)
        client_thread.start()
        assert provider.entered.wait(STARTUP_TIMEOUT_SECONDS)
        uvicorn_server.should_exit = True
        _wait_until(lambda: not any(item.is_serving() for item in uvicorn_server.servers))
        assert exporter.get_finished_spans() == ()
        provider.release.set()
        client_thread.join(STARTUP_TIMEOUT_SECONDS)
    finally:
        provider.release.set()
        uvicorn_server.should_exit = True
        server_thread.join(STARTUP_TIMEOUT_SECONDS)
        server_socket.close()

    ((status, body),) = responses
    assert status == 200
    assert json.loads(body)["result"]["outcome"] == "interpreted"
    assert not server_thread.is_alive()
    assert sorted(span.kind.name for span in exporter.get_finished_spans()) == sorted(
        kind.name for kind in (SpanKind.SERVER, SpanKind.INTERNAL, SpanKind.CLIENT)
    )


def test_request_outlasting_the_drain_timeout_is_cancelled_before_spans_are_flushed(
    settings: Settings,
) -> None:
    events: list[str] = []
    exporter = ShutdownRecordingExporter(events)
    runtime = build_telemetry_runtime(
        load_telemetry_config(ENABLED), "development", span_exporter=exporter
    )
    provider = HangingModelProvider(events)
    app = create_app(settings, provider, telemetry=runtime)
    server_socket = socket.socket()
    server_socket.bind(("127.0.0.1", 0))
    port = server_socket.getsockname()[1]
    uvicorn_server = uvicorn.Server(
        uvicorn.Config(
            app, timeout_graceful_shutdown=TEST_DRAIN_TIMEOUT_SECONDS, log_level="critical"
        )
    )
    unfinished_at_telemetry_shutdown: list[asyncio.Task[None]] = []
    exporter.on_shutdown = lambda: unfinished_at_telemetry_shutdown.extend(
        task for task in uvicorn_server.server_state.tasks if not task.done()
    )
    server_thread = threading.Thread(target=uvicorn_server.run, kwargs={"sockets": [server_socket]})
    responses: list[tuple[int, bytes]] = []
    client_thread = threading.Thread(target=lambda: responses.append(_post_interpret(port)))

    server_thread.start()
    try:
        _wait_until(lambda: uvicorn_server.started)
        client_thread.start()
        assert provider.entered.wait(STARTUP_TIMEOUT_SECONDS)
        uvicorn_server.should_exit = True
        server_thread.join(STARTUP_TIMEOUT_SECONDS)
        client_thread.join(STARTUP_TIMEOUT_SECONDS)
    finally:
        uvicorn_server.should_exit = True
        server_thread.join(STARTUP_TIMEOUT_SECONDS)
        server_socket.close()

    assert not server_thread.is_alive()
    assert events == ["model call cancelled", "telemetry shutdown"]
    assert unfinished_at_telemetry_shutdown == []
    ((status, _),) = responses
    assert status == 500
    spans = exporter.get_finished_spans()
    assert sorted(span.kind.name for span in spans) == sorted(
        kind.name for kind in (SpanKind.SERVER, SpanKind.INTERNAL, SpanKind.CLIENT)
    )
    assert all(span.end_time is not None for span in spans)


def _post_interpret(port: int) -> tuple[int, bytes]:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=STARTUP_TIMEOUT_SECONDS)
    try:
        connection.request(
            "POST",
            "/v1/intent/interpret",
            body=json.dumps({"prompt": "Radiohead"}),
            headers={**AUTH_HEADERS, "Content-Type": "application/json"},
        )
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def _wait_until(condition: Callable[[], bool]) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while not condition() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert condition()


def _ipv6_loopback_available() -> bool:
    if not socket.has_ipv6:
        return False
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as probe:
            probe.bind(("::1", 0))
    except OSError:
        return False
    return True


def _get_health(host: str, port: int) -> int:
    connection = http.client.HTTPConnection(host, port, timeout=STARTUP_TIMEOUT_SECONDS)
    try:
        connection.request("GET", "/health")
        return connection.getresponse().status
    finally:
        connection.close()


@pytest.mark.skipif(not _ipv6_loopback_available(), reason="IPv6 loopback is unavailable")
def test_bound_server_accepts_ipv4_and_ipv6_loopback(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in SERVER_ENV.items():
        monkeypatch.setenv(name, value)
    server_socket = bind_dual_stack_socket(0)
    port = server_socket.getsockname()[1]
    uvicorn_server = build_server()
    thread = threading.Thread(target=uvicorn_server.run, kwargs={"sockets": [server_socket]})
    thread.start()

    try:
        deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
        while not uvicorn_server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert uvicorn_server.started

        assert _get_health("127.0.0.1", port) == 200
        assert _get_health("::1", port) == 200
    finally:
        uvicorn_server.should_exit = True
        thread.join(STARTUP_TIMEOUT_SECONDS)
        server_socket.close()
