import base64
import binascii
import re
from collections.abc import Mapping
from urllib.parse import urlsplit

LANGFUSE_TRACES_PATH = "/api/public/otel/v1/traces"
LANGFUSE_AUTHORIZATION_HEADER = "authorization"
LANGFUSE_INGESTION_VERSION_HEADER = "x-langfuse-ingestion-version"
LANGFUSE_INGESTION_VERSION = "4"
LANGFUSE_KEY_PAIR_PREFIXES = ("pk-lf-", "sk-lf-")
LANGFUSE_ENVIRONMENT_PATTERN = re.compile(r"^(?!langfuse)[a-z0-9_-]{1,40}$")
BASIC_AUTHENTICATION_SCHEME = "basic"


def langfuse_endpoint_problem(endpoint: str) -> str | None:
    parts = urlsplit(endpoint)
    if parts.path.endswith(LANGFUSE_TRACES_PATH) and not parts.query:
        return None
    return (
        "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT must be the complete Langfuse traces URL ending "
        f"in {LANGFUSE_TRACES_PATH}, without a query, when AI_TELEMETRY_BACKEND=langfuse"
    )


def langfuse_headers_problem(headers: Mapping[str, str]) -> str | None:
    if headers.get(LANGFUSE_INGESTION_VERSION_HEADER) != LANGFUSE_INGESTION_VERSION:
        return (
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS must include "
            f"{LANGFUSE_INGESTION_VERSION_HEADER}={LANGFUSE_INGESTION_VERSION} "
            "when AI_TELEMETRY_BACKEND=langfuse"
        )

    if not _is_langfuse_basic_authorization(headers.get(LANGFUSE_AUTHORIZATION_HEADER, "")):
        return (
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS must include Authorization=Basic followed by "
            "the standard base64 encoding of <public key>:<secret key> (pk-lf-… and sk-lf-…) "
            "when AI_TELEMETRY_BACKEND=langfuse"
        )
    return None


def langfuse_environment_problem(environment: str) -> str | None:
    if LANGFUSE_ENVIRONMENT_PATTERN.fullmatch(environment):
        return None
    return (
        "deployment.environment.name must be 1-40 lowercase letters, digits, '-' or '_' and "
        "must not start with 'langfuse' when AI_TELEMETRY_BACKEND=langfuse"
    )


def _is_langfuse_basic_authorization(value: str) -> bool:
    scheme, _separator, credentials = value.partition(" ")
    if scheme.lower() != BASIC_AUTHENTICATION_SCHEME or not credentials:
        return False

    try:
        decoded = base64.b64decode(credentials, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False

    public_key, separator, secret_key = decoded.partition(":")
    return bool(separator) and all(
        _has_key(key, prefix)
        for key, prefix in zip((public_key, secret_key), LANGFUSE_KEY_PAIR_PREFIXES, strict=True)
    )


def _has_key(value: str, prefix: str) -> bool:
    return value.startswith(prefix) and len(value) > len(prefix) and value.isprintable()
