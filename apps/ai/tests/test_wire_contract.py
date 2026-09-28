import json
import re
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from app.models.interpretation import InterpretIntentRequest, InterpretIntentResponse
from app.models.refinement import PlanRefinementRequest, PlanRefinementResponse
from app.models.service import AiServiceErrorResponse, AiServiceHealth

CONTRACT_DIR = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "ai-service"
CONTRACT_PATH = CONTRACT_DIR / "ai-service.contract.json"
FIXTURES_PATH = CONTRACT_DIR / "ai-service.fixtures.json"

WIRE_MODELS: dict[str, type[BaseModel]] = {
    "AiServiceErrorResponse": AiServiceErrorResponse,
    "AiServiceHealth": AiServiceHealth,
    "InterpretIntentRequest": InterpretIntentRequest,
    "InterpretIntentResponse": InterpretIntentResponse,
    "PlanRefinementRequest": PlanRefinementRequest,
    "PlanRefinementResponse": PlanRefinementResponse,
}

KEPT_KEYWORDS = (
    "type",
    "const",
    "enum",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "additionalProperties",
)

PROVIDER_FIELD_PATTERN = re.compile(
    r"(^id$|Ids?$|uri|url|image|artwork|cover|spotify|lastfm|soundiiz|token|secret"
    r"|credential|password|isrc|email|device|playback|market)",
    re.IGNORECASE,
)

JsonSchema = dict[str, Any]


def normalize(schema: JsonSchema, definitions: JsonSchema) -> JsonSchema:
    if "$ref" in schema:
        return normalize(definitions[schema["$ref"].removeprefix("#/$defs/")], definitions)

    normalized: JsonSchema = {
        keyword: schema[keyword] for keyword in KEPT_KEYWORDS if keyword in schema
    }
    if "enum" in normalized:
        normalized["enum"] = sorted(normalized["enum"])

    if "properties" in schema:
        normalized["properties"] = {
            name: normalize(schema["properties"][name], definitions)
            for name in sorted(schema["properties"])
        }
    if "required" in schema:
        normalized["required"] = sorted(schema["required"])
    if "items" in schema:
        normalized["items"] = normalize(schema["items"], definitions)

    variants = schema.get("anyOf") or schema.get("oneOf")
    if variants:
        normalized["anyOf"] = sorted(
            (normalize(variant, definitions) for variant in variants),
            key=lambda variant: json.dumps(variant, separators=(",", ":")),
        )

    return normalized


def normalized_contract() -> dict[str, JsonSchema]:
    contract: dict[str, JsonSchema] = {}

    for name in sorted(WIRE_MODELS):
        schema = WIRE_MODELS[name].model_json_schema(by_alias=True, mode="validation")
        contract[name] = normalize(schema, schema.get("$defs", {}))

    return contract


def property_names(schema: JsonSchema) -> list[str]:
    names: list[str] = []

    for name, child in schema.get("properties", {}).items():
        names.extend([name, *property_names(child)])
    if "items" in schema:
        names.extend(property_names(schema["items"]))
    for variant in schema.get("anyOf", []):
        names.extend(property_names(variant))

    return names


def load_fixture_cases() -> list[dict[str, Any]]:
    return json.loads(FIXTURES_PATH.read_text())["cases"]


def test_pydantic_models_match_the_committed_typescript_contract() -> None:
    committed = json.loads(CONTRACT_PATH.read_text())

    assert normalized_contract() == committed


@pytest.mark.parametrize("case", load_fixture_cases(), ids=lambda case: case["name"])
def test_pydantic_agrees_with_the_shared_fixture_verdict(case: dict[str, Any]) -> None:
    model = WIRE_MODELS[case["schema"]]

    if not case["valid"]:
        with pytest.raises(ValidationError):
            model.model_validate_json(json.dumps(case["payload"]))
        return

    parsed = model.model_validate_json(json.dumps(case["payload"]))
    assert parsed.model_dump(mode="json") == case["payload"]


def test_interpret_request_accepts_only_a_user_authored_prompt() -> None:
    request = normalized_contract()["InterpretIntentRequest"]

    assert list(request["properties"]) == ["prompt"]


def test_no_wire_field_can_carry_provider_ids_urls_artwork_or_credentials() -> None:
    offending = [
        name
        for schema in normalized_contract().values()
        for name in property_names(schema)
        if PROVIDER_FIELD_PATTERN.search(name)
    ]

    assert offending == []


def test_refinement_request_accepts_only_ai_safe_state_and_the_user_refinement() -> None:
    request = normalized_contract()["PlanRefinementRequest"]

    assert list(request["properties"]) == ["intent", "preservation", "refinement"]
    assert list(request["properties"]["preservation"]["properties"]) == [
        "artists",
        "firstTracks",
        "positions",
    ]
