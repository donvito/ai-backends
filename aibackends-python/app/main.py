from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from aibackends import __version__ as library_version
from aibackends import get_runtime
from aibackends.core.tool_calls import clean_answer, extract_tool_calls
from aibackends.tasks import (
    classify_async,
    embed_async,
    extract_invoice_async,
    redact_pii_async,
    summarize_async,
)

from app.auth import require_bearer
from app.config import DEFAULT_MODEL, DEFAULT_MODEL_PATH, DEFAULT_RUNTIME, HOST, PORT
from app.runtime import apply_defaults, resolve_model, resolve_runtime
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ClassifyRequest,
    ClassifyResponse,
    DemoToolCallRequest,
    DemoToolCallResponse,
    EmbedRequest,
    EmbedResponse,
    ErrorResponse,
    ExtractInvoiceRequest,
    ExtractInvoiceResponse,
    RedactPiiRequest,
    RedactPiiResponse,
    SummarizeRequest,
    SummarizeResponse,
    ToolCallResponse,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    apply_defaults()
    yield


app = FastAPI(
    title="aibackends-python",
    description=(
        "HTTP wrapper around the aibackends Python library "
        "(https://github.com/donvito/aibackends). "
        "Local Python HTTP API for aibackends; complements the TypeScript AI Backends server."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _runtime_kwargs(
    runtime: str | None,
    model: str | None,
    model_path: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> dict[str, Any]:
    """Resolve request overrides, falling back to service defaults."""
    kwargs: dict[str, Any] = {}
    runtime_name = runtime or DEFAULT_RUNTIME
    resolved_runtime = resolve_runtime(runtime_name)
    resolved_model = resolve_model(model or DEFAULT_MODEL)
    if resolved_runtime is not None:
        kwargs["runtime"] = resolved_runtime
    if resolved_model is not None:
        kwargs["model"] = resolved_model
    # Local GGUF path only applies to llamacpp. Applying it to transformers
    # makes Hugging Face loaders try to parse the .gguf as JSON config.
    path = model_path
    if path is None and runtime_name == "llamacpp":
        path = DEFAULT_MODEL_PATH
    if path:
        kwargs["model_path"] = path
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if temperature is not None:
        kwargs["temperature"] = temperature
    return kwargs


def _http_error(exc: Exception) -> HTTPException:
    message = str(exc) or exc.__class__.__name__
    missing_extra = isinstance(exc, ImportError) or (
        "Install 'aibackends[" in message and "]' to use" in message
    )
    if missing_extra:
        detail = message
        if "Install the matching aibackends extra" not in detail:
            detail = (
                f"{message.rstrip('.')}."
                " Install the matching aibackends extra "
                "(llamacpp, transformers, and/or pii)."
            )
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        )
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


def _demo_weather(city: str) -> dict[str, Any]:
    return {
        "city": city,
        "temperature_c": 21,
        "condition": "partly cloudy",
        "humidity": "58%",
    }


@app.get("/health", tags=["meta"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "library": "aibackends",
        "library_version": library_version,
        "default_runtime": DEFAULT_RUNTIME,
        "default_model": DEFAULT_MODEL,
        "default_model_path": DEFAULT_MODEL_PATH,
    }


@app.post(
    "/v1/summarize",
    response_model=SummarizeResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
    dependencies=[Depends(require_bearer)],
    tags=["tasks"],
)
async def summarize(body: SummarizeRequest) -> SummarizeResponse:
    try:
        summary = await summarize_async(
            body.text,
            **_runtime_kwargs(
                body.runtime,
                body.model,
                body.model_path,
                body.max_tokens,
                body.temperature,
            ),
        )
    except Exception as exc:  # noqa: BLE001 - surface library errors as HTTP
        raise _http_error(exc) from exc
    return SummarizeResponse(summary=clean_answer(summary))


@app.post(
    "/v1/classify",
    response_model=ClassifyResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
    dependencies=[Depends(require_bearer)],
    tags=["tasks"],
)
async def classify(body: ClassifyRequest) -> ClassifyResponse:
    try:
        result = await classify_async(
            body.text,
            labels=body.labels,
            label_descriptions=body.label_descriptions,
            prompt=body.prompt,
            **_runtime_kwargs(
                body.runtime,
                body.model,
                body.model_path,
                body.max_tokens,
                body.temperature,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        raise _http_error(exc) from exc
    return ClassifyResponse(
        label=result.label,
        confidence=result.confidence,
        all_scores=result.all_scores,
    )


@app.post(
    "/v1/redact-pii",
    response_model=RedactPiiResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
    dependencies=[Depends(require_bearer)],
    tags=["tasks"],
)
async def redact_pii(body: RedactPiiRequest) -> RedactPiiResponse:
    try:
        result = await redact_pii_async(
            body.text,
            backend=body.backend,
            labels=body.labels,
        )
    except Exception as exc:  # noqa: BLE001
        raise _http_error(exc) from exc
    return RedactPiiResponse.model_validate(result.model_dump())


@app.post(
    "/v1/embed",
    response_model=EmbedResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
    dependencies=[Depends(require_bearer)],
    tags=["tasks"],
)
async def embed(body: EmbedRequest) -> EmbedResponse:
    try:
        vector = await embed_async(
            body.text,
            **_runtime_kwargs(body.runtime, body.model, body.model_path),
        )
    except Exception as exc:  # noqa: BLE001
        raise _http_error(exc) from exc
    return EmbedResponse(embedding=vector, dimensions=len(vector))


@app.post(
    "/v1/extract-invoice",
    response_model=ExtractInvoiceResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
    dependencies=[Depends(require_bearer)],
    tags=["tasks"],
)
async def extract_invoice(body: ExtractInvoiceRequest) -> ExtractInvoiceResponse:
    try:
        result = await extract_invoice_async(
            body.text,
            **_runtime_kwargs(
                body.runtime,
                body.model,
                body.model_path,
                body.max_tokens,
                body.temperature,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        raise _http_error(exc) from exc
    return ExtractInvoiceResponse.model_validate(result.model_dump())


@app.post(
    "/v1/chat",
    response_model=ChatResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
    dependencies=[Depends(require_bearer)],
    tags=["chat"],
)
async def chat(body: ChatRequest) -> ChatResponse:
    """Chat completion with optional native tool schemas (LFM2.5-friendly)."""

    def _run() -> ChatResponse:
        messages: list[dict[str, str]] = [
            {"role": message.role, "content": message.content}
            for message in body.messages
        ]
        if body.tools:
            tool_prompt = f"List of tools: {json.dumps(body.tools)}"
            if messages and messages[0]["role"] == "system":
                messages[0]["content"] = f"{messages[0]['content']}\n\n{tool_prompt}"
            else:
                messages.insert(0, {"role": "system", "content": tool_prompt})

        overrides = _runtime_kwargs(
            body.runtime,
            body.model,
            body.model_path,
            body.max_tokens,
            body.temperature,
        )
        overrides.setdefault("extra_options", {})
        overrides["extra_options"] = {
            **overrides.get("extra_options", {}),
            "skip_special_tokens": False,
        }
        runtime = get_runtime(overrides)
        response = runtime.complete(messages)
        calls = extract_tool_calls(response.content)
        return ChatResponse(
            content=clean_answer(response.content),
            tool_calls=[
                ToolCallResponse(name=call.name, arguments=call.arguments)
                for call in calls
            ],
            raw_content=response.content,
        )

    try:
        return await asyncio.to_thread(_run)
    except Exception as exc:  # noqa: BLE001
        raise _http_error(exc) from exc


@app.post(
    "/v1/tool-call-demo",
    response_model=DemoToolCallResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
    dependencies=[Depends(require_bearer)],
    tags=["chat"],
)
async def tool_call_demo(body: DemoToolCallRequest) -> DemoToolCallResponse:
    """End-to-end LFM2.5 tool-calling demo using a stub get_weather tool."""

    def _run() -> DemoToolCallResponse:
        tools = [
            {
                "name": "get_weather",
                "description": "Get the current weather for a city.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "city": {
                            "type": "string",
                            "description": "City name, e.g. Paris",
                        }
                    },
                    "required": ["city"],
                },
            }
        ]
        messages: list[dict[str, str]] = [
            {"role": "system", "content": f"List of tools: {json.dumps(tools)}"},
            {"role": "user", "content": body.question},
        ]
        overrides = _runtime_kwargs(
            body.runtime,
            body.model,
            body.model_path,
            body.max_tokens or 1024,
            body.temperature,
        )
        overrides["extra_options"] = {
            **overrides.get("extra_options", {}),
            "skip_special_tokens": False,
        }
        runtime = get_runtime(overrides)
        first = runtime.complete(messages)
        calls = extract_tool_calls(first.content)
        if not calls:
            return DemoToolCallResponse(
                question=body.question,
                tool_calls=[],
                tool_results=[],
                final_answer=clean_answer(first.content),
                raw_model_content=first.content,
            )

        results: list[dict[str, Any]] = []
        tool_call_payload: list[ToolCallResponse] = []
        for call in calls:
            tool_call_payload.append(
                ToolCallResponse(name=call.name, arguments=call.arguments)
            )
            if call.name == "get_weather":
                results.append(_demo_weather(**call.arguments))
            else:
                results.append({"error": f"Unknown tool: {call.name}"})

        messages.append({"role": "assistant", "content": clean_answer(first.content)})
        messages.append({"role": "tool", "content": json.dumps(results)})
        final = runtime.complete(messages)
        return DemoToolCallResponse(
            question=body.question,
            tool_calls=tool_call_payload,
            tool_results=results,
            final_answer=clean_answer(final.content),
            raw_model_content=first.content,
        )

    try:
        return await asyncio.to_thread(_run)
    except Exception as exc:  # noqa: BLE001
        raise _http_error(exc) from exc


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    run()
