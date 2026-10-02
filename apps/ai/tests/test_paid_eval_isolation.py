import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
PAID_EVAL_SCRIPT = "eval:ai"
PAID_EVAL_MARKERS = ("eval:ai", "run_intent_eval", "ALLOW_PAID_AI_EVALS")
TELEMETRY_SMOKE_SCRIPT = "smoke:langfuse"
TELEMETRY_SMOKE_MARKERS = ("smoke:langfuse", "langfuse_smoke")
MANUAL_SCRIPTS = {
    PAID_EVAL_SCRIPT: PAID_EVAL_MARKERS,
    TELEMETRY_SMOKE_SCRIPT: TELEMETRY_SMOKE_MARKERS,
}
AUTOMATION_PATHS = [
    *sorted((REPO_ROOT / ".github" / "workflows").glob("*.yml")),
    *sorted(path for path in (REPO_ROOT / ".husky").iterdir() if path.is_file()),
    *sorted((REPO_ROOT / "scripts").iterdir()),
]


@pytest.mark.parametrize("script", sorted(MANUAL_SCRIPTS))
def test_only_the_manual_script_runs_the_manual_operation(script: str) -> None:
    scripts = json.loads((REPO_ROOT / "package.json").read_text())["scripts"]

    invoking = [
        name
        for name, command in scripts.items()
        if any(marker in command for marker in MANUAL_SCRIPTS[script])
    ]

    assert invoking == [script]
    assert f"pre{script}" not in scripts
    assert f"post{script}" not in scripts


@pytest.mark.parametrize("path", AUTOMATION_PATHS, ids=lambda path: path.name)
def test_automation_never_invokes_a_manual_operation(path: Path) -> None:
    content = path.read_text()

    assert not any(marker in content for marker in (*PAID_EVAL_MARKERS, *TELEMETRY_SMOKE_MARKERS))
