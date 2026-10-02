import base64
import socket
import threading
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.observability.telemetry_runtime import TelemetryRuntime

ENABLED = {"OTEL_SDK_DISABLED": "false"}
LISTEN_BACKLOG = 16
ACCEPT_POLL_SECONDS = 0.05
LOOPBACK_HOST = "127.0.0.1"
FAKE_LANGFUSE_PUBLIC_KEY = "pk-lf-fake-transport-public"
FAKE_LANGFUSE_SECRET_KEY = "sk-lf-fake-transport-secret"
FAKE_LANGFUSE_BASIC_CREDENTIALS = base64.b64encode(
    f"{FAKE_LANGFUSE_PUBLIC_KEY}:{FAKE_LANGFUSE_SECRET_KEY}".encode()
).decode()
FAKE_LANGFUSE_SECRETS = (
    FAKE_LANGFUSE_PUBLIC_KEY,
    FAKE_LANGFUSE_SECRET_KEY,
    FAKE_LANGFUSE_BASIC_CREDENTIALS,
)
LANGFUSE_LOOPBACK_TRACES_PATH = "/api/public/otel/v1/traces"


@dataclass(frozen=True, slots=True)
class ReceivedExport:
    method: str
    path: str
    headers: Mapping[str, str]
    body: bytes


def record_spans(runtime: TelemetryRuntime, count: int, name: str = "filler") -> None:
    tracer = runtime.tracer_provider.get_tracer(__name__)
    for _ in range(count):
        tracer.start_span(name).end()


def closed_loopback_port() -> int:
    with socket.socket() as probe:
        probe.bind((LOOPBACK_HOST, 0))
        return probe.getsockname()[1]


def langfuse_otlp_environ(port: int, timeout_seconds: str) -> dict[str, str]:
    return {
        **ENABLED,
        "AI_TELEMETRY_BACKEND": "langfuse",
        "OTEL_TRACES_EXPORTER": "otlp",
        "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": (
            f"http://{LOOPBACK_HOST}:{port}{LANGFUSE_LOOPBACK_TRACES_PATH}"
        ),
        "OTEL_EXPORTER_OTLP_TRACES_HEADERS": (
            f"Authorization=Basic%20{FAKE_LANGFUSE_BASIC_CREDENTIALS},"
            "x-langfuse-ingestion-version=4"
        ),
        "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT": timeout_seconds,
    }


@contextmanager
def loopback_otlp_receiver(
    status: HTTPStatus = HTTPStatus.OK, response_headers: Mapping[str, str] | None = None
) -> Iterator[tuple[int, list[ReceivedExport]]]:
    received: list[ReceivedExport] = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            body = self.rfile.read(int(self.headers["Content-Length"]))
            headers = {key.lower(): value for key, value in self.headers.items()}
            received.append(ReceivedExport(self.command, self.path, headers, body))
            self.send_response(status)
            for name, value in (response_headers or {}).items():
                self.send_header(name, value)
            self.send_header("Content-Type", "application/x-protobuf")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            return

    server = ThreadingHTTPServer((LOOPBACK_HOST, 0), Handler)
    thread = threading.Thread(
        target=server.serve_forever, kwargs={"poll_interval": ACCEPT_POLL_SECONDS}, daemon=True
    )
    thread.start()
    try:
        yield server.server_port, received
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@contextmanager
def unresponsive_otlp_destination() -> Iterator[tuple[int, list[socket.socket]]]:
    accepted: list[socket.socket] = []
    stopped = threading.Event()
    listener = socket.socket()
    listener.bind((LOOPBACK_HOST, 0))
    listener.listen(LISTEN_BACKLOG)
    listener.settimeout(ACCEPT_POLL_SECONDS)

    def accept_until_stopped() -> None:
        while not stopped.is_set():
            try:
                connection, _address = listener.accept()
            except TimeoutError:
                continue
            accepted.append(connection)

    thread = threading.Thread(target=accept_until_stopped, daemon=True)
    thread.start()
    try:
        yield listener.getsockname()[1], accepted
    finally:
        stopped.set()
        thread.join()
        listener.close()
        for connection in accepted:
            connection.close()
