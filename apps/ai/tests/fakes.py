import asyncio
from collections.abc import Mapping, Sequence

from app.providers.model_provider import ModelIntentRequest, ModelIntentResult, ModelTokenUsage

FAKE_MODEL = "fake-model"
FAKE_USAGE = ModelTokenUsage(input_tokens=120, output_tokens=40)

ScriptedOutput = Mapping[str, object] | Exception


class ScriptedModelProvider:
    def __init__(self, outputs: Sequence[ScriptedOutput]) -> None:
        self._outputs = list(outputs)
        self.requests: list[ModelIntentRequest] = []

    @property
    def is_available(self) -> bool:
        return True

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        self.requests.append(request)
        output = self._outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return ModelIntentResult(payload=output, model=FAKE_MODEL, usage=FAKE_USAGE)


class HangingModelProvider:
    @property
    def is_available(self) -> bool:
        return True

    async def generate_intent(self, request: ModelIntentRequest) -> ModelIntentResult:
        await asyncio.sleep(60)
        return ModelIntentResult(payload={}, model=FAKE_MODEL, usage=None)


def interpreted_output(**intent_overrides: object) -> dict[str, object]:
    intent: dict[str, object] = {
        "kind": "artist_mix",
        "artists": ["Radiohead", "Interpol"],
        "genres": [],
        "seedTracks": [],
        "targetTrackCount": 30,
        "targetDurationMinutes": None,
        "mood": None,
        "popularity": "rarities",
        "orderMode": None,
        "excludeArtists": ["Coldplay"],
        "excludeTracks": [],
        "unsupportedConstraints": [],
    }
    intent.update(intent_overrides)
    return {"outcome": "interpreted", "intent": intent}
