import base64

import pytest

from app.observability.telemetry_config import (
    InvalidTelemetryConfigError,
    load_telemetry_config,
)

PUBLIC_KEY = "pk-lf-fake-public-key"
SECRET_KEY = "sk-lf-fake-secret-never-rendered1"
LANGFUSE_ENDPOINT = "https://langfuse.example.test/api/public/otel/v1/traces"
ENABLED = {"OTEL_SDK_DISABLED": "false"}


def _basic(credentials: str) -> str:
    return base64.b64encode(credentials.encode()).decode()


AUTH_STRING = _basic(f"{PUBLIC_KEY}:{SECRET_KEY}")
LANGFUSE_HEADERS = f"Authorization=Basic%20{AUTH_STRING},x-langfuse-ingestion-version=4"
LANGFUSE = {
    **ENABLED,
    "AI_TELEMETRY_BACKEND": "langfuse",
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": LANGFUSE_ENDPOINT,
    "OTEL_EXPORTER_OTLP_TRACES_HEADERS": LANGFUSE_HEADERS,
}


def _rejected(environ: dict[str, str], match: str) -> str:
    with pytest.raises(InvalidTelemetryConfigError, match=match) as error:
        load_telemetry_config(environ)

    message = str(error.value)
    for secret in (SECRET_KEY, AUTH_STRING, PUBLIC_KEY):
        assert secret not in message
    return message


def test_backend_defaults_to_generic() -> None:
    assert load_telemetry_config(ENABLED).backend == "generic"


def test_generic_backend_keeps_existing_otlp_rules_for_any_destination() -> None:
    config = load_telemetry_config(
        {
            **ENABLED,
            "AI_TELEMETRY_BACKEND": " Generic ",
            "OTEL_TRACES_EXPORTER": "otlp",
            "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": LANGFUSE_ENDPOINT,
            "OTEL_RESOURCE_ATTRIBUTES": "deployment.environment.name=Preview Env",
        }
    )

    assert config.backend == "generic"
    assert config.otlp is not None
    assert config.otlp.headers == {}


@pytest.mark.parametrize("backend", ["langfuse", "not-a-backend"])
def test_disabled_telemetry_ignores_the_backend_and_needs_no_credentials(backend: str) -> None:
    config = load_telemetry_config({"AI_TELEMETRY_BACKEND": backend})

    assert not config.enabled
    assert config.backend == "generic"
    assert config.otlp is None


def test_unknown_backend_is_rejected_without_echoing_it() -> None:
    message = _rejected(
        {**ENABLED, "AI_TELEMETRY_BACKEND": f"langfuse-{SECRET_KEY}"}, "AI_TELEMETRY_BACKEND"
    )

    assert "generic, langfuse" in message


def test_langfuse_backend_accepts_the_documented_trace_endpoint_and_headers() -> None:
    config = load_telemetry_config({**LANGFUSE, "AI_TELEMETRY_BACKEND": "LANGFUSE"})

    assert AUTH_STRING.endswith("==")
    assert config.backend == "langfuse"
    assert config.otlp is not None
    assert config.otlp.endpoint == LANGFUSE_ENDPOINT
    assert config.otlp.headers == {
        "authorization": f"Basic {AUTH_STRING}",
        "x-langfuse-ingestion-version": "4",
    }
    assert SECRET_KEY not in repr(config)
    assert AUTH_STRING not in repr(config)


@pytest.mark.parametrize(
    ("credentials", "auth_string"),
    [
        ("pk-lf-a:sk-lf-b", "cGstbGYtYTpzay1sZi1i"),
        ("pk-lf-a:sk-lf-???", "cGstbGYtYTpzay1sZi0/Pz8="),
        ("pk-lf-a:sk-lf-bc", "cGstbGYtYTpzay1sZi1iYw=="),
        ("pk-lf-a?:sk-lf-b>>", "cGstbGYtYT86c2stbGYtYj4+"),
    ],
)
def test_langfuse_authorization_keeps_base64_padding_and_symbols(
    credentials: str, auth_string: str
) -> None:
    percent_encoded = auth_string.replace("+", "%2B").replace("/", "%2F").replace("=", "%3D")
    assert _basic(credentials) == auth_string

    for header_value in (
        f"Basic%20{auth_string}",
        f"Basic {auth_string}",
        f"Basic%20{percent_encoded}",
    ):
        config = load_telemetry_config(
            {
                **LANGFUSE,
                "OTEL_EXPORTER_OTLP_TRACES_HEADERS": (
                    f"authorization={header_value},x-langfuse-ingestion-version=4"
                ),
            }
        )

        assert config.otlp is not None
        assert config.otlp.headers["authorization"] == f"Basic {auth_string}"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://127.0.0.1:4318/api/public/otel/v1/traces",
        "https://langfuse.internal.example.test/langfuse/api/public/otel/v1/traces",
    ],
)
def test_langfuse_endpoint_allows_loopback_and_self_hosted_prefixes(endpoint: str) -> None:
    config = load_telemetry_config({**LANGFUSE, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": endpoint})

    assert config.otlp is not None
    assert config.otlp.endpoint == endpoint


@pytest.mark.parametrize("exporter", ["none", "console", ""])
def test_langfuse_backend_requires_the_otlp_exporter(exporter: str) -> None:
    _rejected(
        {**LANGFUSE, "OTEL_TRACES_EXPORTER": exporter},
        "AI_TELEMETRY_BACKEND=langfuse requires OTEL_TRACES_EXPORTER=otlp",
    )


def test_langfuse_backend_still_requires_an_explicit_endpoint() -> None:
    environ = dict(LANGFUSE)
    del environ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"]

    _rejected(environ, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is required")


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://langfuse.example.test/api/public/otel",
        "https://langfuse.example.test/v1/traces",
        "https://langfuse.example.test/api/public/otel/v1/traces/",
        f"https://langfuse.example.test/api/public/otel/v1/traces?key={SECRET_KEY}",
    ],
)
def test_langfuse_backend_requires_the_trace_signal_path(endpoint: str) -> None:
    message = _rejected(
        {**LANGFUSE, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": endpoint}, "/api/public/otel/v1/traces"
    )

    assert endpoint not in message


def test_langfuse_backend_keeps_https_for_remote_destinations() -> None:
    plain_http = LANGFUSE_ENDPOINT.replace("https://", "http://")

    _rejected({**LANGFUSE, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": plain_http}, "complete https URL")


@pytest.mark.parametrize(
    "headers",
    [
        f"authorization=Basic%20{AUTH_STRING}",
        f"authorization=Basic%20{AUTH_STRING},x-langfuse-ingestion-version=3",
        f"authorization=Basic%20{AUTH_STRING},x-langfuse-ingestion-version=v4",
    ],
)
def test_langfuse_backend_requires_ingestion_version_4(headers: str) -> None:
    _rejected(
        {**LANGFUSE, "OTEL_EXPORTER_OTLP_TRACES_HEADERS": headers},
        "x-langfuse-ingestion-version=4",
    )


@pytest.mark.parametrize(
    "authorization",
    [
        None,
        f"Bearer%20{AUTH_STRING}",
        "Basic",
        "Basic%20",
        f"Basic{AUTH_STRING}",
        f"Basic%20%20{AUTH_STRING}",
        f"Basic%20{AUTH_STRING.rstrip('=')}",
        f"Basic%20{AUTH_STRING}=",
        f"Basic%20{AUTH_STRING}%20extra",
        f"Basic%20{AUTH_STRING[:-4]}*{AUTH_STRING[-3:]}",
        f"Basic%20{_basic(f'{PUBLIC_KEY}{SECRET_KEY}')}",
        f"Basic%20{_basic(f':{SECRET_KEY}')}",
        f"Basic%20{_basic(f'{PUBLIC_KEY}:')}",
        f"Basic%20{_basic(f'{SECRET_KEY}:{PUBLIC_KEY}')}",
        f"Basic%20{_basic('pk-lf-:sk-lf-')}",
        f"Basic%20{_basic(f'{PUBLIC_KEY}:sk-lf-with\nnewline')}",
        f"Basic%20{base64.b64encode(b'pk-lf-a:sk-lf-' + bytes([0xFF])).decode()}",
    ],
)
def test_malformed_langfuse_authorization_is_rejected_safely(authorization: str | None) -> None:
    headers = "x-langfuse-ingestion-version=4"
    if authorization is not None:
        headers = f"authorization={authorization},{headers}"

    _rejected({**LANGFUSE, "OTEL_EXPORTER_OTLP_TRACES_HEADERS": headers}, "Authorization=Basic")


def test_malformed_header_syntax_keeps_the_generic_error() -> None:
    _rejected(
        {**LANGFUSE, "OTEL_EXPORTER_OTLP_TRACES_HEADERS": f"authorization,{SECRET_KEY}"},
        "OTEL_EXPORTER_OTLP_TRACES_HEADERS must be comma-separated",
    )


def test_langfuse_backend_accepts_a_valid_environment_override() -> None:
    config = load_telemetry_config(
        {**LANGFUSE, "OTEL_RESOURCE_ATTRIBUTES": "deployment.environment.name=preview_2"}
    )

    assert config.resource_attributes == {"deployment.environment.name": "preview_2"}


@pytest.mark.parametrize(
    "environment",
    ["Production", "preview env", "langfuse-prod", "a" * 41, "staging.eu"],
)
def test_langfuse_backend_rejects_environments_langfuse_would_rewrite(environment: str) -> None:
    message = _rejected(
        {**LANGFUSE, "OTEL_RESOURCE_ATTRIBUTES": f"deployment.environment.name={environment}"},
        "deployment.environment.name must be 1-40 lowercase",
    )

    assert environment not in message
