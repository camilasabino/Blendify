import hmac

from fastapi import Request

from app.config.settings import Settings
from app.errors import AiServiceError

BEARER_PREFIX = "Bearer "


def require_internal_token(request: Request) -> None:
    settings: Settings = request.app.state.settings
    expected = settings.service_token

    if expected is None:
        raise AiServiceError("UNAUTHORIZED")

    authorization = request.headers.get("authorization", "")
    if not authorization.startswith(BEARER_PREFIX):
        raise AiServiceError("UNAUTHORIZED")

    presented = authorization.removeprefix(BEARER_PREFIX).encode()
    if not hmac.compare_digest(presented, expected.get_secret_value().encode()):
        raise AiServiceError("UNAUTHORIZED")
