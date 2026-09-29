import os
import socket
from collections.abc import Mapping

import uvicorn

APP_FACTORY = "app.main:create_app"
DUAL_STACK_HOST = "::"
MAX_PORT = 65535


class InvalidServerPortError(Exception):
    pass


def read_port(environ: Mapping[str, str] | None = None) -> int:
    source = os.environ if environ is None else environ
    value = source.get("PORT", "").strip()

    if not value.isdecimal() or not 0 < int(value) <= MAX_PORT:
        raise InvalidServerPortError(
            f"Invalid AI service environment: PORT must be an integer between 1 and {MAX_PORT}"
        )
    return int(value)


def bind_dual_stack_socket(port: int) -> socket.socket:
    server_socket = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    try:
        # Railway health checks arrive over IPv4 while the private network may use IPv6;
        # asyncio would otherwise leave an AF_INET6 listener IPv6-only.
        server_socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((DUAL_STACK_HOST, port))
    except OSError:
        server_socket.close()
        raise
    return server_socket


def build_server() -> uvicorn.Server:
    return uvicorn.Server(uvicorn.Config(APP_FACTORY, factory=True))


def main() -> None:
    server_socket = bind_dual_stack_socket(read_port())
    build_server().run(sockets=[server_socket])


if __name__ == "__main__":
    main()
