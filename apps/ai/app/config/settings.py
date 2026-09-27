import os
from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, ConfigDict, SecretStr, ValidationError, model_validator

MIN_SERVICE_TOKEN_LENGTH = 32

Environment = Literal["development", "production"]


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    environment: Environment
    service_token: SecretStr | None

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def require_production_service_token(self) -> "Settings":
        if not self.is_production:
            return self

        token = self.service_token.get_secret_value() if self.service_token else ""
        if len(token) < MIN_SERVICE_TOKEN_LENGTH:
            raise ValueError(
                "AI_SERVICE_TOKEN must be a random value of at least "
                f"{MIN_SERVICE_TOKEN_LENGTH} characters in production"
            )
        return self


class InvalidSettingsError(Exception):
    pass


def load_settings(environ: Mapping[str, str] | None = None) -> Settings:
    source = os.environ if environ is None else environ
    token = source.get("AI_SERVICE_TOKEN", "").strip()

    try:
        return Settings(
            environment=source.get("AI_SERVICE_ENV", "development").strip(),  # type: ignore[arg-type]
            service_token=SecretStr(token) if token else None,
        )
    except ValidationError as error:
        problems = "; ".join(str(detail["msg"]) for detail in error.errors())
        raise InvalidSettingsError(f"Invalid AI service environment: {problems}") from None
