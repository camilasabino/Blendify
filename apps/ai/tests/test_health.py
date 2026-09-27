from app.providers.disabled import DisabledModelProvider
from tests.conftest import ClientFactory
from tests.fakes import ScriptedModelProvider


def test_health_reports_ok_without_credentials_or_model_calls(make_client: ClientFactory) -> None:
    provider = ScriptedModelProvider([])

    response = make_client(provider).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "intentInterpretation": "available"}
    assert provider.requests == []


def test_health_reports_interpretation_unavailable_without_a_model_provider(
    make_client: ClientFactory,
) -> None:
    response = make_client(DisabledModelProvider()).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "intentInterpretation": "unavailable"}
