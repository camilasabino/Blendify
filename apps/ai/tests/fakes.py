import asyncio
from collections.abc import Mapping, Sequence

from app.providers.model_provider import ModelIntentRequest

ScriptedOutput = Mapping[str, object] | Exception


class ScriptedModelProvider:
    def __init__(self, outputs: Sequence[ScriptedOutput]) -> None:
        self._outputs = list(outputs)
        self.requests: list[ModelIntentRequest] = []

    @property
    def is_available(self) -> bool:
        return True

    async def generate_intent(self, request: ModelIntentRequest) -> Mapping[str, object]:
        self.requests.append(request)
        output = self._outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return output


class HangingModelProvider:
    @property
    def is_available(self) -> bool:
        return True

    async def generate_intent(self, request: ModelIntentRequest) -> Mapping[str, object]:
        await asyncio.sleep(60)
        return {}


def interpreted_output(**intent_overrides: object) -> dict[str, object]:
    intent: dict[str, object] = {
        "kind": "artist_mix",
        "artists": ["Radiohead", "Interpol"],
        "genres": [],
        "seedTracks": [],
        "targetTrackCount": 30,
        "popularity": "rarities",
        "orderMode": None,
        "excludeArtists": ["Coldplay"],
        "excludeTracks": [],
        "unsupportedConstraints": [],
    }
    intent.update(intent_overrides)
    return {"outcome": "interpreted", "intent": intent}
