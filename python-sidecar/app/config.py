from __future__ import annotations

import os


def env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


ACCESS_TOKEN = env("AIBACKENDS_ACCESS_TOKEN") or env("DEFAULT_ACCESS_TOKEN")
DEFAULT_RUNTIME = env("AIBACKENDS_RUNTIME", "llamacpp")
DEFAULT_MODEL = env("AIBACKENDS_MODEL", "gemma3-270m-it")
# Optional local GGUF / weights path. When set, llamacpp uses this file
# instead of downloading a Hugging Face repo for the model ref.
DEFAULT_MODEL_PATH = env("AIBACKENDS_MODEL_PATH")
HOST = env("AIBACKENDS_SIDECAR_HOST", "0.0.0.0") or "0.0.0.0"
PORT = int(env("AIBACKENDS_SIDECAR_PORT", "8000") or "8000")
SKIP_AUTH = (env("AIBACKENDS_SKIP_AUTH", "false") or "false").lower() in {
    "1",
    "true",
    "yes",
}
