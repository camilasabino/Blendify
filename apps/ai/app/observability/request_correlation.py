import re
from contextvars import ContextVar

from starlette.types import ASGIApp, Receive, Scope, Send

REQUEST_ID_HEADER = b"x-request-id"
REQUEST_ID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def current_request_id() -> str | None:
    return _request_id.get()


class RequestCorrelationMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        token = _request_id.set(incoming_request_id(scope))
        try:
            await self._app(scope, receive, send)
        finally:
            _request_id.reset(token)


def incoming_request_id(scope: Scope) -> str | None:
    for name, value in scope["headers"]:
        if name.lower() == REQUEST_ID_HEADER:
            candidate = value.decode("latin-1")
            return candidate if REQUEST_ID_PATTERN.fullmatch(candidate) else None
    return None
