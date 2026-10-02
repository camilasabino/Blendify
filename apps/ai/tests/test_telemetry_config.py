import pytest

from app.observability.telemetry_config import (
    InvalidTelemetryConfigError,
    load_telemetry_config,
)

HEADER_SECRET = "otlp-header-secret-never-rendered"
ENDPOINT_SECRET = "endpoint-query-secret-never-rendered"
ENABLED = {"OTEL_SDK_DISABLED": "false"}
OTLP = {
    **ENABLED,
    "OTEL_TRACES_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://collector.example.test/v1/traces",
}


def test_telemetry_is_disabled_by_default() -> None:
    config = load_telemetry_config({})

    assert not config.enabled
    assert config.exporter == "none"
    assert config.otlp is None


@pytest.mark.parametrize("value", ["true", "TRUE", " True "])
def test_sdk_disabled_true_disables_telemetry(value: str) -> None:
    assert not load_telemetry_config({"OTEL_SDK_DISABLED": value}).enabled


def test_disabled_telemetry_ignores_exporter_settings() -> None:
    config = load_telemetry_config(
        {
            "OTEL_TRACES_EXPORTER": "otlp",
            "OTEL_TRACES_SAMPLER_ARG": "not-a-number",
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS": f"authorization={HEADER_SECRET}",
        }
    )

    assert not config.enabled
    assert config.otlp is None


def test_invalid_sdk_disabled_value_is_rejected() -> None:
    with pytest.raises(InvalidTelemetryConfigError, match="OTEL_SDK_DISABLED"):
        load_telemetry_config({"OTEL_SDK_DISABLED": "yes"})


def test_enabled_defaults_trace_locally_without_an_exporter() -> None:
    config = load_telemetry_config(ENABLED)

    assert config.enabled
    assert config.exporter == "none"
    assert config.service_name == "blendify-ai"
    assert config.sampler_ratio == 1.0
    assert config.resource_attributes == {}
    assert config.otlp is None


def test_service_name_can_be_overridden() -> None:
    config = load_telemetry_config({**ENABLED, "OTEL_SERVICE_NAME": " blendify-ai-preview "})

    assert config.service_name == "blendify-ai-preview"


@pytest.mark.parametrize("exporter", ["console", "CONSOLE", "none"])
def test_supported_local_exporters_need_no_endpoint(exporter: str) -> None:
    config = load_telemetry_config({**ENABLED, "OTEL_TRACES_EXPORTER": exporter})

    assert config.exporter == exporter.lower()
    assert config.otlp is None


@pytest.mark.parametrize("exporter", ["jaeger", "zipkin", "otlp,console", "logging"])
def test_unsupported_or_multiple_exporters_are_rejected(exporter: str) -> None:
    with pytest.raises(InvalidTelemetryConfigError, match="OTEL_TRACES_EXPORTER"):
        load_telemetry_config({**ENABLED, "OTEL_TRACES_EXPORTER": exporter})


def test_sampler_ratio_is_configurable() -> None:
    config = load_telemetry_config(
        {
            **ENABLED,
            "OTEL_TRACES_SAMPLER": "parentbased_traceidratio",
            "OTEL_TRACES_SAMPLER_ARG": "0.1",
        }
    )

    assert config.sampler_ratio == 0.1


@pytest.mark.parametrize("sampler", ["always_on", "traceidratio", "parentbased_always_off"])
def test_unsupported_samplers_are_rejected(sampler: str) -> None:
    with pytest.raises(InvalidTelemetryConfigError, match="OTEL_TRACES_SAMPLER"):
        load_telemetry_config({**ENABLED, "OTEL_TRACES_SAMPLER": sampler})


@pytest.mark.parametrize("ratio", ["-0.1", "1.5", "nan", "inf", "half"])
def test_sampler_ratio_must_be_between_zero_and_one(ratio: str) -> None:
    with pytest.raises(InvalidTelemetryConfigError, match="OTEL_TRACES_SAMPLER_ARG"):
        load_telemetry_config({**ENABLED, "OTEL_TRACES_SAMPLER_ARG": ratio})


def test_supported_resource_attributes_are_decoded() -> None:
    config = load_telemetry_config(
        {
            **ENABLED,
            "OTEL_RESOURCE_ATTRIBUTES": (
                "service.version=2026.10.1%2Babc123, deployment.environment.name=preview"
            ),
        }
    )

    assert config.resource_attributes == {
        "service.version": "2026.10.1+abc123",
        "deployment.environment.name": "preview",
    }


@pytest.mark.parametrize(
    "attributes",
    [
        "host.name=railway-box",
        "service.name=other",
        "service.version",
        "service.version=",
        "=value",
        f"service.version={'v' * 256}",
    ],
)
def test_unsupported_or_malformed_resource_attributes_are_rejected(attributes: str) -> None:
    with pytest.raises(InvalidTelemetryConfigError, match="OTEL_RESOURCE_ATTRIBUTES"):
        load_telemetry_config({**ENABLED, "OTEL_RESOURCE_ATTRIBUTES": attributes})


def test_otlp_requires_an_explicit_traces_endpoint() -> None:
    environ = {**OTLP}
    del environ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"]

    with pytest.raises(InvalidTelemetryConfigError, match="OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"):
        load_telemetry_config(environ)


def test_otlp_configuration_is_parsed() -> None:
    config = load_telemetry_config(
        {
            **OTLP,
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS": (
                f"Authorization=Bearer%20{HEADER_SECRET}, x-tenant = blendify"
            ),
            "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT": "2.5",
        }
    )

    assert config.otlp is not None
    assert config.otlp.endpoint == "https://collector.example.test/v1/traces"
    assert dict(config.otlp.headers) == {
        "authorization": f"Bearer {HEADER_SECRET}",
        "x-tenant": "blendify",
    }
    assert config.otlp.timeout_seconds == 2.5


def test_otlp_defaults_to_no_headers_and_a_bounded_timeout() -> None:
    config = load_telemetry_config(OTLP)

    assert config.otlp is not None
    assert dict(config.otlp.headers) == {}
    assert config.otlp.timeout_seconds == 2


def test_timeout_accepts_the_documented_maximum() -> None:
    config = load_telemetry_config({**OTLP, "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT": "3"})

    assert config.otlp is not None
    assert config.otlp.timeout_seconds == 3


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://127.0.0.1:4318/v1/traces",
        "http://localhost:4318/v1/traces",
        "http://[::1]:4318/v1/traces",
    ],
)
def test_plain_http_is_accepted_only_for_loopback(endpoint: str) -> None:
    config = load_telemetry_config({**OTLP, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": endpoint})

    assert config.otlp is not None
    assert config.otlp.endpoint == endpoint


@pytest.mark.parametrize(
    "endpoint",
    [
        f"http://collector.example.test/v1/traces?token={ENDPOINT_SECRET}",
        f"https://user:{ENDPOINT_SECRET}@collector.example.test/v1/traces",
        f"https://collector.example.test/v1/traces#{ENDPOINT_SECRET}",
        f"ftp://collector.example.test/{ENDPOINT_SECRET}",
        f"https:///{ENDPOINT_SECRET}",
        f"https://collector.example.test:99999/{ENDPOINT_SECRET}",
    ],
)
def test_unsafe_endpoints_are_rejected_without_echoing_them(endpoint: str) -> None:
    with pytest.raises(InvalidTelemetryConfigError) as raised:
        load_telemetry_config({**OTLP, "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": endpoint})

    assert "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT" in str(raised.value)
    assert ENDPOINT_SECRET not in str(raised.value)


@pytest.mark.parametrize(
    "headers",
    [
        HEADER_SECRET,
        f"authorization={HEADER_SECRET},broken",
        f"bad header={HEADER_SECRET}",
        f"authorization={HEADER_SECRET}%0D%0Ainjected=1",
        "authorization=",
    ],
)
def test_malformed_headers_are_rejected_without_echoing_them(headers: str) -> None:
    with pytest.raises(InvalidTelemetryConfigError) as raised:
        load_telemetry_config({**OTLP, "OTEL_EXPORTER_OTLP_TRACES_HEADERS": headers})

    assert "OTEL_EXPORTER_OTLP_TRACES_HEADERS" in str(raised.value)
    assert HEADER_SECRET not in str(raised.value)
    assert raised.value.__cause__ is None


@pytest.mark.parametrize("timeout", ["0", "-1", "3.01", "10", "10000", "nan", "soon"])
def test_timeout_must_be_a_bounded_number_of_seconds(timeout: str) -> None:
    with pytest.raises(InvalidTelemetryConfigError, match="OTEL_EXPORTER_OTLP_TRACES_TIMEOUT"):
        load_telemetry_config({**OTLP, "OTEL_EXPORTER_OTLP_TRACES_TIMEOUT": timeout})


@pytest.mark.parametrize(
    "variable",
    [
        "OTEL_EXPORTER_OTLP_HEADERS",
        "OTEL_EXPORTER_OTLP_CERTIFICATE",
        "OTEL_EXPORTER_OTLP_CLIENT_KEY",
        "OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE",
        "OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE",
        "OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY",
        "OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE",
        "OTEL_PYTHON_EXPORTER_OTLP_HTTP_CREDENTIAL_PROVIDER",
        "OTEL_PYTHON_EXPORTER_OTLP_HTTP_TRACES_CREDENTIAL_PROVIDER",
        "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_REQUEST",
        "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_RESPONSE",
        "OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SANITIZE_FIELDS",
        "OTEL_PYTHON_INSTRUMENTATION_HTTP_CAPTURE_ALL_METHODS",
        "OTEL_SEMCONV_STABILITY_OPT_IN",
        "OTEL_PROPAGATORS",
    ],
)
@pytest.mark.parametrize("exporter", ["none", "console", "otlp"])
def test_implicitly_read_variables_outside_the_contract_are_rejected_without_echoing_them(
    variable: str, exporter: str
) -> None:
    with pytest.raises(InvalidTelemetryConfigError) as raised:
        load_telemetry_config(
            {**OTLP, "OTEL_TRACES_EXPORTER": exporter, variable: f"x-api-key={HEADER_SECRET}"}
        )

    assert variable in str(raised.value)
    assert HEADER_SECRET not in str(raised.value)


def test_every_unsupported_variable_that_is_set_is_reported() -> None:
    with pytest.raises(InvalidTelemetryConfigError) as raised:
        load_telemetry_config(
            {
                **ENABLED,
                "OTEL_EXPORTER_OTLP_HEADERS": f"authorization={HEADER_SECRET}",
                "OTEL_EXPORTER_OTLP_CERTIFICATE": "/etc/ssl/collector.pem",
            }
        )

    assert "OTEL_EXPORTER_OTLP_HEADERS" in str(raised.value)
    assert "OTEL_EXPORTER_OTLP_CERTIFICATE" in str(raised.value)
    assert "/etc/ssl" not in str(raised.value)


def test_disabled_telemetry_ignores_unsupported_variables() -> None:
    config = load_telemetry_config(
        {
            "OTEL_EXPORTER_OTLP_HEADERS": f"authorization={HEADER_SECRET}",
            "OTEL_EXPORTER_OTLP_CERTIFICATE": "/etc/ssl/collector.pem",
            "OTEL_PROPAGATORS": "b3",
        }
    )

    assert not config.enabled


@pytest.mark.parametrize(
    "variable",
    [
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "OTEL_EXPORTER_OTLP_TIMEOUT",
        "OTEL_EXPORTER_OTLP_COMPRESSION",
        "OTEL_EXPORTER_OTLP_TRACES_COMPRESSION",
    ],
)
def test_variables_neutralized_by_explicit_exporter_arguments_are_accepted(variable: str) -> None:
    config = load_telemetry_config({**OTLP, variable: "gzip"})

    assert config.otlp is not None


def test_otlp_secrets_are_never_rendered() -> None:
    config = load_telemetry_config(
        {
            **OTLP,
            "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": (
                f"https://collector.example.test/v1/traces?token={ENDPOINT_SECRET}"
            ),
            "OTEL_EXPORTER_OTLP_TRACES_HEADERS": f"authorization={HEADER_SECRET}",
        }
    )

    assert HEADER_SECRET not in repr(config)
    assert ENDPOINT_SECRET not in repr(config)
    assert HEADER_SECRET not in str(config)
