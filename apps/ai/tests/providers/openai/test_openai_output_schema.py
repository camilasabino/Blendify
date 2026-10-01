from typing import Any

import pytest
from pydantic import ValidationError

from app.models.intent import IntentInterpretation, intent_interpretation_adapter
from app.models.refinement import RefinementInterpretation, refinement_interpretation_adapter
from app.providers.openai.output_schema import (
    STRICT_MODE_KEYWORDS,
    build_model_output_schema,
)

JsonSchema = dict[str, Any]


def walk(schema: JsonSchema) -> list[JsonSchema]:
    nodes = [schema]
    for child in schema.get("properties", {}).values():
        nodes.extend(walk(child))
    for child in schema.get("$defs", {}).values():
        nodes.extend(walk(child))
    if "items" in schema:
        nodes.extend(walk(schema["items"]))
    for variant in schema.get("anyOf", []):
        nodes.extend(walk(variant))
    return nodes


MODEL_OUTPUTS = pytest.mark.parametrize(
    "result_type",
    [IntentInterpretation, RefinementInterpretation],
    ids=["intent", "refinement"],
)


@MODEL_OUTPUTS
def test_uses_only_keywords_accepted_by_strict_structured_outputs(result_type: object) -> None:
    used = {keyword for node in walk(build_model_output_schema(result_type)) for keyword in node}

    assert used <= STRICT_MODE_KEYWORDS


@MODEL_OUTPUTS
def test_every_object_is_closed_and_requires_every_property(result_type: object) -> None:
    schema = build_model_output_schema(result_type)
    objects = [node for node in walk(schema) if node.get("type") == "object"]

    assert objects
    for node in objects:
        assert node["additionalProperties"] is False
        assert sorted(node["required"]) == sorted(node["properties"])


@MODEL_OUTPUTS
def test_root_is_an_object_wrapping_the_interpretation_union(result_type: object) -> None:
    schema = build_model_output_schema(result_type)

    assert schema["type"] == "object"
    assert list(schema["properties"]) == ["result"]
    assert len(schema["properties"]["result"]["anyOf"]) == 2


def test_exposes_no_capability_verdict_to_the_model() -> None:
    unsupported = build_model_output_schema(IntentInterpretation)["$defs"]["UnsupportedConstraint"]

    assert sorted(unsupported["properties"]) == ["category", "userText"]


def test_bounds_dropped_for_the_model_are_still_enforced_by_the_wire_model() -> None:
    too_long_name = "x" * 201
    output = {
        "outcome": "interpreted",
        "intent": {
            "kind": "artist_mix",
            "artists": [too_long_name],
            "genres": [],
            "seedTracks": [],
            "filters": {
                "region": None,
                "femaleVocals": False,
                "releaseRange": None,
                "excludeLive": False,
            },
            "targetTrackCount": None,
            "targetDurationMinutes": None,
            "mood": None,
            "popularity": None,
            "orderMode": None,
            "excludeArtists": [],
            "excludeTracks": [],
            "unsupportedConstraints": [],
        },
    }

    with pytest.raises(ValidationError):
        intent_interpretation_adapter.validate_python(output)


def test_refinement_patch_operations_stay_explicit_for_the_model() -> None:
    definitions = build_model_output_schema(RefinementInterpretation)["$defs"]

    assert definitions["ClearValue"]["properties"]["operation"] == {
        "enum": ["clear"],
        "type": "string",
    }
    assert sorted(definitions["SetMood"]["properties"]) == ["operation", "value"]
    assert sorted(definitions["IntentPatch"]["properties"]) == sorted(
        definitions["IntentPatch"]["required"]
    )
    assert "unsupportedConstraints" not in definitions["IntentPatch"]["properties"]


def test_refinement_bounds_dropped_for_the_model_are_still_enforced() -> None:
    names = {"add": ["x" * 201], "remove": []}
    output = {
        "outcome": "interpreted",
        "patch": {
            "kind": None,
            "artists": names,
            "genres": {"add": [], "remove": []},
            "seedTracks": {"add": [], "remove": []},
            "filters": {
                "region": None,
                "femaleVocals": None,
                "releaseRange": None,
                "excludeLive": None,
            },
            "targetTrackCount": None,
            "targetDurationMinutes": None,
            "mood": None,
            "popularity": None,
            "orderMode": None,
            "excludeArtists": {"add": [], "remove": []},
            "excludeTracks": {"add": [], "remove": []},
        },
        "preservation": {
            "firstTracks": None,
            "positions": {"add": [], "remove": []},
            "artists": {"add": [], "remove": []},
        },
        "unsupportedConstraints": [],
    }

    with pytest.raises(ValidationError):
        refinement_interpretation_adapter.validate_python(output)
