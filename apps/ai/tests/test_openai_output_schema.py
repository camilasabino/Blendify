from typing import Any

import pytest
from pydantic import ValidationError

from app.models.intent import intent_interpretation_adapter
from app.providers.openai_output_schema import (
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


def test_uses_only_keywords_accepted_by_strict_structured_outputs() -> None:
    used = {keyword for node in walk(build_model_output_schema()) for keyword in node}

    assert used <= STRICT_MODE_KEYWORDS


def test_every_object_is_closed_and_requires_every_property() -> None:
    objects = [node for node in walk(build_model_output_schema()) if node.get("type") == "object"]

    assert objects
    for node in objects:
        assert node["additionalProperties"] is False
        assert sorted(node["required"]) == sorted(node["properties"])


def test_root_is_an_object_wrapping_the_interpretation_union() -> None:
    schema = build_model_output_schema()

    assert schema["type"] == "object"
    assert list(schema["properties"]) == ["result"]
    assert len(schema["properties"]["result"]["anyOf"]) == 2


def test_exposes_no_capability_verdict_to_the_model() -> None:
    unsupported = build_model_output_schema()["$defs"]["UnsupportedConstraint"]

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
