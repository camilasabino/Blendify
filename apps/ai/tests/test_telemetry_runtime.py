import logging
import threading
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import ExportTraceServiceRequest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app.config.settings import Settings
from app.main import create_app
from app.observability.telemetry_config import load_telemetry_config
from app.observability.telemetry_runtime import TelemetryRuntime, build_telemetry_runtime
from tests.conftest import AUTH_HEADERS
from tests.fakes import ScriptedModelProvider

HEADER_SECRET = "otlp-header-secret-never-rendered"
ENABLED = {"OTEL_SDK_DISABLED": "false"}

ReceivedRequest = tuple[Mapping[str, str], bytes]


class ShutdownCountingExporter(InMemorySpanExporter):
    def __init__(self) -> None:
        super().__init__()
        self.shutdown_calls = 0

    def shutdown(self) -> None:
        self.shutdown_calls += 1


def _record_span(runtime: TelemetryRuntime, name: str) -> None:
    with runtime.tracer_provider.get_tracer(__name__).start_as_current_span(name):
        pass


def _span_names(exporter: InMemorySpanExporter) -> list[str]:
    return [span.name for span in exporter.get_finished_spans()]


def _in_memory_runtime(
    exporter: InMemorySpanExporter,
    environ: Mapping[str, str] = ENABLED,
    deployment_environment: str = "development",
) -> TelemetryRuntime:
    return build_telemetry_runtime(
        load_telemetry_config(environ), deployment_environment, span_exporter=exporter
    )


def _app_client(settings: Settings, runtime: TelemetryRuntime) -> TestClient:
    app = create_app(settings, ScriptedModelProvider([]), telemetry=runtime)
    return TestClient(app, raise_server_exceptions=False)


@contextmanager
def _local_otlp_destination() -> Iterator[tuple[str, list[ReceivedRequest]]]:
    received: list[ReceivedRequest] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            body = self.rfile.read(int(self.headers["Content-Length"]))
            received.append(({key.lower(): value for key, value in self.headers.items()}, body))
            self.send_response(200)
            self.send_header("Content-Type", "application/x-protobuf")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/v1/traces", received
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_disabled_runtime_is_a_no_op_without_threads() -> None:
    runtime = build_telemetry_runtime(load_telemetry_config({}), "development")
    threads_before = threading.active_count()

    runtime.start()
    span = runtime.tracer_provider.get_tracer(__name__).start_span("ignored")
    span.end()
    runtime.shutdown()

    assert isinstance(runtime.tracer_provider, trace.NoOpTracerProvider)
    assert not span.get_span_context().is_valid
    assert threading.active_count() == threads_before


def test_default_app_lifecycle_runs_with_telemetry_disabled(
    settings: Settings, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("OTEL_TRACES_EXPORTER", "console")
    app = create_app(settings, ScriptedModelProvider([]))

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200

    assert capsys.readouterr().out == ""


def test_enabled_runtime_without_exporter_traces_without_an_export_thread() -> None:
    runtime = build_telemetry_runtime(load_telemetry_config(ENABLED), "development")
    threads_before = threading.active_count()

    runtime.start()
    span = runtime.tracer_provider.get_tracer(__name__).start_span("local")
    span.end()

    assert span.get_span_context().is_valid
    assert threading.active_count() == threads_before
    runtime.shutdown()


def test_exported_spans_carry_resource_metadata(settings: Settings) -> None:
    exporter = InMemorySpanExporter()
    runtime = _in_memory_runtime(
        exporter,
        {**ENABLED, "OTEL_RESOURCE_ATTRIBUTES": "service.version=2026.10.1"},
        deployment_environment="production",
    )

    with _app_client(settings, runtime):
        _record_span(runtime, "resource.check")

    (span,) = exporter.get_finished_spans()
    assert span.name == "resource.check"
    assert dict(span.resource.attributes) == {
        "service.name": "blendify-ai",
        "service.version": "2026.10.1",
        "deployment.environment.name": "production",
    }


def test_resource_metadata_omits_unknown_version_and_honors_environment_override(
    settings: Settings,
) -> None:
    exporter = InMemorySpanExporter()
    runtime = _in_memory_runtime(
        exporter,
        {
            **ENABLED,
            "OTEL_SERVICE_NAME": "blendify-ai-preview",
            "OTEL_RESOURCE_ATTRIBUTES": "deployment.environment.name=preview",
        },
    )

    with _app_client(settings, runtime):
        _record_span(runtime, "resource.override")

    (span,) = exporter.get_finished_spans()
    assert dict(span.resource.attributes) == {
        "service.name": "blendify-ai-preview",
        "deployment.environment.name": "preview",
    }


def test_two_apps_own_independent_runtimes(settings: Settings) -> None:
    exporter_a, exporter_b = InMemorySpanExporter(), InMemorySpanExporter()
    runtime_a, runtime_b = _in_memory_runtime(exporter_a), _in_memory_runtime(exporter_b)

    with _app_client(settings, runtime_b):
        with _app_client(settings, runtime_a):
            _record_span(runtime_a, "a")

        _record_span(runtime_a, "a.after-shutdown")
        _record_span(runtime_b, "b")

    assert _span_names(exporter_a) == ["a"]
    assert _span_names(exporter_b) == ["b"]
    (span_b,) = exporter_b.get_finished_spans()
    assert span_b.parent is None
    assert trace.get_current_span() is trace.INVALID_SPAN


def test_repeated_lifecycles_neither_duplicate_processors_nor_leak_threads(
    settings: Settings,
) -> None:
    threads_before = threading.active_count()

    for cycle in range(3):
        exporter = ShutdownCountingExporter()
        runtime = _in_memory_runtime(exporter)

        with _app_client(settings, runtime):
            runtime.start()
            _record_span(runtime, f"cycle-{cycle}")

        runtime.shutdown()
        assert _span_names(exporter) == [f"cycle-{cycle}"]
        assert exporter.shutdown_calls == 1

    assert threading.active_count() == threads_before


def test_runtime_never_replaces_the_global_tracer_provider(settings: Settings) -> None:
    runtime = _in_memory_runtime(InMemorySpanExporter())

    with _app_client(settings, runtime):
        assert not isinstance(trace.get_tracer_provider(), TracerProvider)


def test_otlp_exports_to_the_explicit_local_destination(
    settings: Settings, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    with _local_otlp_destination() as (endpoint, received):
        config = load_telemetry_config(
            {
                **ENABLED,
                "OTEL_TRACES_EXPORTER": "otlp",
                "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": endpoint,
                "OTEL_EXPORTER_OTLP_TRACES_HEADERS": f"authorization=Bearer%20{HEADER_SECRET}",
                "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT": "2",
            }
        )
        runtime = build_telemetry_runtime(config, "development")
        app = create_app(settings, ScriptedModelProvider([]), telemetry=runtime)

        with TestClient(app) as client:
            assert client.get("/health", headers=AUTH_HEADERS).status_code == 200
            _record_span(runtime, "otlp.check")
            assert HEADER_SECRET not in repr(app.state._state)

    (headers, body), *_ = received
    assert len(received) == 1
    assert headers["authorization"] == f"Bearer {HEADER_SECRET}"
    assert headers["content-type"] == "application/x-protobuf"
    (resource_spans,) = ExportTraceServiceRequest.FromString(body).resource_spans
    resource = {item.key: item.value.string_value for item in resource_spans.resource.attributes}
    assert resource["service.name"] == "blendify-ai"
    assert [span.name for scope in resource_spans.scope_spans for span in scope.spans] == [
        "otlp.check"
    ]
    assert HEADER_SECRET not in caplog.text


def test_otlp_exporter_ignores_generic_and_compression_variables_from_the_process(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    with _local_otlp_destination() as (endpoint, received):
        config = load_telemetry_config(
            {
                **ENABLED,
                "OTEL_TRACES_EXPORTER": "otlp",
                "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": endpoint,
            }
        )
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:9/elsewhere")
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_TIMEOUT", "0.000001")
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_COMPRESSION", "gzip")
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_TRACES_COMPRESSION", "deflate")
        runtime = build_telemetry_runtime(config, "development")

        with _app_client(settings, runtime):
            _record_span(runtime, "otlp.neutralized")

    ((headers, body),) = received
    assert "content-encoding" not in headers
    (resource_spans,) = ExportTraceServiceRequest.FromString(body).resource_spans
    assert [span.name for scope in resource_spans.scope_spans for span in scope.spans] == [
        "otlp.neutralized"
    ]


def test_console_exporter_writes_spans_only_when_selected(
    settings: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    config = load_telemetry_config({**ENABLED, "OTEL_TRACES_EXPORTER": "console"})
    runtime = build_telemetry_runtime(config, "development")

    with _app_client(settings, runtime):
        _record_span(runtime, "console.check")

    assert '"name": "console.check"' in capsys.readouterr().out
