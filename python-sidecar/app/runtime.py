from __future__ import annotations

from aibackends import configure
from aibackends.core.config import parse_model_text, parse_runtime_text
from aibackends.core.registry import ModelRef, RuntimeSpec

from app.config import DEFAULT_MODEL, DEFAULT_RUNTIME


def resolve_runtime(name: str | None) -> RuntimeSpec | None:
    if name is None:
        return None
    return parse_runtime_text(name)


def resolve_model(name: str | None) -> ModelRef | None:
    if name is None:
        return None
    return parse_model_text(name)


def apply_defaults() -> None:
    runtime = resolve_runtime(DEFAULT_RUNTIME)
    model = resolve_model(DEFAULT_MODEL)
    if runtime is not None or model is not None:
        configure(runtime=runtime, model=model)
