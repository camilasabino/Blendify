from typing import Any

from pydantic import create_model

from app.models.wire import WireModel

MODEL_OUTPUT_RESULT_FIELD = "result"

STRICT_MODE_KEYWORDS = frozenset(
    {
        "type",
        "properties",
        "required",
        "additionalProperties",
        "items",
        "anyOf",
        "enum",
        "$ref",
        "$defs",
        "minItems",
        "maxItems",
        "minimum",
        "maximum",
    }
)

JsonSchema = dict[str, Any]


def build_model_output_schema(result_type: object) -> JsonSchema:
    output_model = create_model(
        "ModelOutput",
        __base__=WireModel,
        **{MODEL_OUTPUT_RESULT_FIELD: (result_type, ...)},  # type: ignore[call-overload]
    )
    schema = output_model.model_json_schema(by_alias=True, mode="validation")
    return _to_strict_mode(schema)


def _to_strict_mode(schema: JsonSchema) -> JsonSchema:
    converted: JsonSchema = {}

    for keyword, value in schema.items():
        if keyword == "const":
            converted["enum"] = [value]
        elif keyword == "oneOf":
            converted["anyOf"] = [_to_strict_mode(variant) for variant in value]
        elif keyword not in STRICT_MODE_KEYWORDS:
            continue
        elif keyword in ("properties", "$defs"):
            converted[keyword] = {name: _to_strict_mode(child) for name, child in value.items()}
        elif keyword == "items":
            converted[keyword] = _to_strict_mode(value)
        elif keyword == "anyOf":
            converted[keyword] = [_to_strict_mode(variant) for variant in value]
        else:
            converted[keyword] = value

    return converted
