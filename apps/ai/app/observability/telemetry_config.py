import math
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Literal, cast
from urllib.parse import unquote, urlsplit

from app.observability.langfuse_config import (
    langfuse_endpoint_problem,
    langfuse_environment_problem,
    langfuse_headers_problem,
)

TracesExporter = Literal["none", "console", "otlp"]
TelemetryBackend = Literal["generic", "langfuse"]

SUPPORTED_TRACES_EXPORTERS: tuple[TracesExporter, ...] = ("none", "console", "otlp")
SUPPORTED_TELEMETRY_BACKENDS: tuple[TelemetryBackend, ...] = ("generic", "langfuse")
SUPPORTED_SAMPLER = "parentbased_traceidratio"
DEPLOYMENT_ENVIRONMENT_ATTRIBUTE = "deployment.environment.name"
SUPPORTED_RESOURCE_ATTRIBUTES = (DEPLOYMENT_ENVIRONMENT_ATTRIBUTE, "service.version")
DEFAULT_SERVICE_NAME = "blendify-ai"
DEFAULT_SAMPLER_RATIO = 1.0
DEFAULT_OTLP_TIMEOUT_SECONDS = 2.0
MAX_OTLP_TIMEOUT_SECONDS = 3.0
MAX_RESOURCE_ATTRIBUTE_LENGTH = 255
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
HEADER_NAME_PATTERN = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")
UNSUPPORTED_EXPORTER_VARIABLES = (
    "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_EXPORTER_OTLP_CERTIFICATE",
    "OTEL_EXPORTER_OTLP_CLIENT_KEY",
    "OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE",
    "OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE",
    "OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY",
    "OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE",
    "OTEL_PYTHON_EXPORTER_OTLP_HTTP_CREDENTIAL_PROVIDER",
    "OTEL_PYTHON_EXPORTER_OTLP_HTTP_TRACES_CREDENTIAL_PROVIDER",
)
UNSUPPORTED_INSTRUMENTATION_VARIABLES = (
    "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_REQUEST",
    "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_RESPONSE",
    "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS",
    "OTEL_PYTHON_INSTRUMENTATION_HTTP_CAPTURE_ALL_METHODS",
    "OTEL_SEMCONV_STABILITY_OPT_IN",
    "OTEL_PROPAGATORS",
)


class InvalidTelemetryConfigError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class OtlpTracesExporterConfig:
    endpoint: str = field(repr=False)
    headers: Mapping[str, str] = field(repr=False)
    timeout_seconds: float


@dataclass(frozen=True, slots=True)
class TelemetryConfig:
    enabled: bool
    exporter: TracesExporter = "none"
    backend: TelemetryBackend = "generic"
    service_name: str = DEFAULT_SERVICE_NAME
    resource_attributes: Mapping[str, str] = field(default_factory=lambda: MappingProxyType({}))
    sampler_ratio: float = DEFAULT_SAMPLER_RATIO
    otlp: OtlpTracesExporterConfig | None = None


DISABLED_TELEMETRY = TelemetryConfig(enabled=False)


def load_telemetry_config(environ: Mapping[str, str] | None = None) -> TelemetryConfig:
    source = os.environ if environ is None else environ

    if _sdk_disabled(source):
        return DISABLED_TELEMETRY

    _reject_unsupported_variables(source)
    exporter = _traces_exporter(source)
    config = TelemetryConfig(
        enabled=True,
        exporter=exporter,
        backend=_telemetry_backend(source),
        service_name=_value(source, "OTEL_SERVICE_NAME") or DEFAULT_SERVICE_NAME,
        resource_attributes=_resource_attributes(source),
        sampler_ratio=_sampler_ratio(source),
        otlp=_otlp_exporter(source) if exporter == "otlp" else None,
    )
    if config.backend == "langfuse":
        _validate_langfuse_destination(config)
    return config


def _sdk_disabled(source: Mapping[str, str]) -> bool:
    value = _value(source, "OTEL_SDK_DISABLED").lower() or "true"
    if value not in ("true", "false"):
        raise _invalid("OTEL_SDK_DISABLED must be true or false")
    return value == "true"


def _reject_unsupported_variables(source: Mapping[str, str]) -> None:
    unsupported = [
        name
        for name in (*UNSUPPORTED_EXPORTER_VARIABLES, *UNSUPPORTED_INSTRUMENTATION_VARIABLES)
        if source.get(name)
    ]
    if unsupported:
        raise _invalid(
            f"unsupported OpenTelemetry variables are set: {', '.join(unsupported)}. "
            "Unset them; only the variables documented in the AI service README are supported"
        )


def _traces_exporter(source: Mapping[str, str]) -> TracesExporter:
    value = _value(source, "OTEL_TRACES_EXPORTER").lower() or "none"
    if value not in SUPPORTED_TRACES_EXPORTERS:
        supported = ", ".join(SUPPORTED_TRACES_EXPORTERS)
        raise _invalid(f"OTEL_TRACES_EXPORTER must be a single value: one of {supported}")
    return cast(TracesExporter, value)


def _telemetry_backend(source: Mapping[str, str]) -> TelemetryBackend:
    value = _value(source, "AI_TELEMETRY_BACKEND").lower() or "generic"
    if value not in SUPPORTED_TELEMETRY_BACKENDS:
        supported = ", ".join(SUPPORTED_TELEMETRY_BACKENDS)
        raise _invalid(f"AI_TELEMETRY_BACKEND must be one of {supported}")
    return cast(TelemetryBackend, value)


def _validate_langfuse_destination(config: TelemetryConfig) -> None:
    if config.otlp is None:
        raise _invalid("AI_TELEMETRY_BACKEND=langfuse requires OTEL_TRACES_EXPORTER=otlp")

    environment = config.resource_attributes.get(DEPLOYMENT_ENVIRONMENT_ATTRIBUTE)
    problem = (
        langfuse_endpoint_problem(config.otlp.endpoint)
        or langfuse_headers_problem(config.otlp.headers)
        or (langfuse_environment_problem(environment) if environment is not None else None)
    )
    if problem is not None:
        raise _invalid(problem)


def _sampler_ratio(source: Mapping[str, str]) -> float:
    sampler = _value(source, "OTEL_TRACES_SAMPLER").lower() or SUPPORTED_SAMPLER
    if sampler != SUPPORTED_SAMPLER:
        raise _invalid(f"OTEL_TRACES_SAMPLER must be {SUPPORTED_SAMPLER}")

    ratio = _number(_value(source, "OTEL_TRACES_SAMPLER_ARG"), DEFAULT_SAMPLER_RATIO)
    if ratio is None or not 0 <= ratio <= 1:
        raise _invalid("OTEL_TRACES_SAMPLER_ARG must be a number between 0 and 1")
    return ratio


def _resource_attributes(source: Mapping[str, str]) -> Mapping[str, str]:
    raw = _value(source, "OTEL_RESOURCE_ATTRIBUTES")
    pairs = _key_value_pairs(raw)
    supported = ", ".join(SUPPORTED_RESOURCE_ATTRIBUTES)

    if pairs is None or any(
        key not in SUPPORTED_RESOURCE_ATTRIBUTES or len(value) > MAX_RESOURCE_ATTRIBUTE_LENGTH
        for key, value in pairs.items()
    ):
        raise _invalid(
            "OTEL_RESOURCE_ATTRIBUTES must be comma-separated key=value pairs using only "
            f"{supported}, each value at most {MAX_RESOURCE_ATTRIBUTE_LENGTH} characters"
        )
    return MappingProxyType(pairs)


def _otlp_exporter(source: Mapping[str, str]) -> OtlpTracesExporterConfig:
    return OtlpTracesExporterConfig(
        endpoint=_otlp_endpoint(source),
        headers=_otlp_headers(source),
        timeout_seconds=_otlp_timeout_seconds(source),
    )


def _otlp_endpoint(source: Mapping[str, str]) -> str:
    endpoint = _value(source, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    if not endpoint:
        raise _invalid("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is required when exporting with otlp")

    if not _is_safe_endpoint(endpoint):
        raise _invalid(
            "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT must be a complete https URL without "
            "credentials or fragment (plain http is accepted only for localhost)"
        )
    return endpoint


def _is_safe_endpoint(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    try:
        hostname, _port = parts.hostname, parts.port
    except ValueError:
        return False

    if not hostname or parts.username or parts.password or parts.fragment:
        return False
    return parts.scheme == "https" or (parts.scheme == "http" and hostname in LOOPBACK_HOSTS)


def _otlp_headers(source: Mapping[str, str]) -> Mapping[str, str]:
    pairs = _key_value_pairs(_value(source, "OTEL_EXPORTER_OTLP_TRACES_HEADERS"))

    if pairs is None or any(
        not HEADER_NAME_PATTERN.fullmatch(name) or "\r" in value or "\n" in value
        for name, value in pairs.items()
    ):
        raise _invalid(
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS must be comma-separated name=value pairs "
            "with URL-encoded values"
        )
    return MappingProxyType({name.lower(): value for name, value in pairs.items()})


def _otlp_timeout_seconds(source: Mapping[str, str]) -> float:
    raw = _value(source, "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT")
    timeout = _number(raw, DEFAULT_OTLP_TIMEOUT_SECONDS)
    if timeout is None or not 0 < timeout <= MAX_OTLP_TIMEOUT_SECONDS:
        raise _invalid(
            "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT must be a number of seconds greater than 0 "
            f"and at most {MAX_OTLP_TIMEOUT_SECONDS:g}"
        )
    return timeout


def _key_value_pairs(raw: str) -> dict[str, str] | None:
    pairs: dict[str, str] = {}
    for entry in raw.split(","):
        if not entry.strip():
            continue

        key, separator, value = entry.partition("=")
        key, value = key.strip(), unquote(value.strip())
        if not separator or not key or not value:
            return None
        pairs[key] = value
    return pairs


def _number(raw: str, default: float) -> float | None:
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def _value(source: Mapping[str, str], name: str) -> str:
    return source.get(name, "").strip()


def _invalid(problem: str) -> InvalidTelemetryConfigError:
    return InvalidTelemetryConfigError(f"Invalid AI service environment: {problem}")
