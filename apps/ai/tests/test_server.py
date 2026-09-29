import http.client
import socket
import threading
import time

import pytest

from app import server
from app.server import (
    APP_FACTORY,
    InvalidServerPortError,
    bind_dual_stack_socket,
    build_server,
    read_port,
)

STARTUP_TIMEOUT_SECONDS = 10
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
