import re
from pathlib import Path

import pytest

APP_ROOT = Path(__file__).resolve().parents[1]
GENERIC_SOURCES = sorted(
    path
    for root in ("app", "evals")
    for path in (APP_ROOT / root).rglob("*.py")
    if "__pycache__" not in path.parts
)
PROVIDER_OWNED = (
    APP_ROOT / "app" / "providers" / "openai",
    APP_ROOT / "app" / "providers" / "registry.py",
)
PROVIDER_SPECIFIC_TERMS = re.compile(r"openai|gpt-|AsyncOpenAI|OPENAI_API_KEY", re.IGNORECASE)


def is_provider_owned(path: Path) -> bool:
    return any(path == owned or owned in path.parents for owned in PROVIDER_OWNED)


def test_the_boundary_check_scans_the_generic_application() -> None:
    names = {path.name for path in GENERIC_SOURCES if not is_provider_owned(path)}

    assert {"settings.py", "main.py", "run_intent_eval.py", "structured_model_call.py"} <= names


@pytest.mark.parametrize(
    "path",
    [path for path in GENERIC_SOURCES if not is_provider_owned(path)],
    ids=lambda path: str(path.relative_to(APP_ROOT)),
)
def test_generic_code_does_not_reference_a_concrete_provider(path: Path) -> None:
    assert PROVIDER_SPECIFIC_TERMS.findall(path.read_text()) == []
