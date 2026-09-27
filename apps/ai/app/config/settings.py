import os
from collections.abc import Mapping
from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict, SecretStr, ValidationError, model_validator

MIN_SERVICE_TOKEN_LENGTH = 32

Environment = Literal["development", "production"]
ModelProviderName = Literal["disabled", "openai"]


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    environment: Environment
    service_token: SecretStr | None
    model_provider: ModelProviderName
    model: str | None = None
    openai_api_key: SecretStr | None = None

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

    @model_validator(mode="after")
    def require_model_provider_configuration(self) -> "Settings":
        if self.model_provider != "openai":
            return self

        if not self.model or not self.model.strip():
            raise ValueError("AI_MODEL is required when AI_PROVIDER=openai")
        if self.openai_api_key is None:
            raise ValueError("OPENAI_API_KEY is required when AI_PROVIDER=openai")
        return self


class InvalidSettingsError(Exception):
    pass


def load_settings(environ: Mapping[str, str] | None = None) -> Settings:
    source = os.environ if environ is None else environ
    environment = source.get("AI_SERVICE_ENV", "development").strip()
    provider = source.get("AI_PROVIDER", "").strip()
    supported_providers = get_args(ModelProviderName)

    if provider not in supported_providers:
        raise InvalidSettingsError(
            "Invalid AI service environment: AI_PROVIDER must be set explicitly to one of "
            f"{', '.join(supported_providers)}"
        )

    try:
        return Settings(
            environment=environment,  # type: ignore[arg-type]
            service_token=_secret(source, "AI_SERVICE_TOKEN"),
            model_provider=provider,  # type: ignore[arg-type]
            model=source.get("AI_MODEL", "").strip() or None,
            openai_api_key=_secret(source, "OPENAI_API_KEY"),
        )
    except ValidationError as error:
        problems = "; ".join(str(detail["msg"]) for detail in error.errors())
        raise InvalidSettingsError(f"Invalid AI service environment: {problems}") from None


def _secret(source: Mapping[str, str], name: str) -> SecretStr | None:
    value = source.get(name, "").strip()
    return SecretStr(value) if value else None
