from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import JSONResponse

from aibackends import __version__ as library_version
from aibackends.tasks import (
    classify_async,
    embed_async,
    extract_invoice_async,
    redact_pii_async,
    summarize_async,
)

from app.auth import require_bearer
from app.config import DEFAULT_MODEL, DEFAULT_RUNTIME, HOST, PORT
from app.runtime import apply_defaults, resolve_model, resolve_runtime
from app.schemas import (
    ClassifyRequest,
    ClassifyResponse,
    EmbedRequest,
    EmbedResponse,
    ErrorResponse,
    ExtractInvoiceRequest,
    ExtractInvoiceResponse,
    RedactPiiRequest,
    RedactPiiResponse,
    SummarizeRequest,
    SummarizeResponse,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    apply_defaults()
    yield


app = FastAPI(
    title="aibackends sidecar",
    description=(
        "HTTP wrapper around the aibackends Python library "
        "(https://github.com/donvito/aibackends). "
        "Runs local GPU/CPU model tasks; complements the TypeScript AI Backends API."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


def _runtime_kwargs(runtime: str | None, model: str | None) -> dict[str, Any]:
    """Resolve request overrides, falling back to sidecar defaults."""
    kwargs: dict[str, Any] = {}
    resolved_runtime = resolve_runtime(runtime or DEFAULT_RUNTIME)
    resolved_model = resolve_model(model or DEFAULT_MODEL)
    if resolved_runtime is not None:
        kwargs["runtime"] = resolved_runtime
    if resolved_model is not None:
        kwargs["model"] = resolved_model
    return kwargs


def _http_error(exc: Exception) -> HTTPException:
    message = str(exc) or exc.__class__.__name__
    missing_extra = isinstance(exc, ImportError) or (
        "Install 'aibackends[" in message and "]' to use" in message
    )
    if missing_extra:
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"{message}. Install the matching aibackends extra "
                "(llamacpp, transformers, and/or pii)."
            ),
        )
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "library": "aibackends",
        "library_version": library_version,
        "default_runtime": DEFAULT_RUNTIME,
        "default_model": DEFAULT_MODEL,
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
            **_runtime_kwargs(body.runtime, body.model),
        )
    except Exception as exc:  # noqa: BLE001 - surface library errors as HTTP
        raise _http_error(exc) from exc
    return SummarizeResponse(summary=summary)


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
            **_runtime_kwargs(body.runtime, body.model),
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
            **_runtime_kwargs(body.runtime, body.model),
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
            **_runtime_kwargs(body.runtime, body.model),
        )
    except Exception as exc:  # noqa: BLE001
        raise _http_error(exc) from exc
    return ExtractInvoiceResponse.model_validate(result.model_dump())


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    run()
