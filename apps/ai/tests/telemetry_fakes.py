import socket
import threading
from collections.abc import Iterator
from contextlib import contextmanager

from app.observability.telemetry_runtime import TelemetryRuntime

ENABLED = {"OTEL_SDK_DISABLED": "false"}
LISTEN_BACKLOG = 16
ACCEPT_POLL_SECONDS = 0.05


def record_spans(runtime: TelemetryRuntime, count: int, name: str = "filler") -> None:
    tracer = runtime.tracer_provider.get_tracer(__name__)
    for _ in range(count):
        tracer.start_span(name).end()


def closed_loopback_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@contextmanager
def unresponsive_otlp_destination() -> Iterator[tuple[int, list[socket.socket]]]:
    accepted: list[socket.socket] = []
    stopped = threading.Event()
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
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
