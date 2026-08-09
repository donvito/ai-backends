from __future__ import annotations

from pydantic import BaseModel, Field


class RuntimeOptions(BaseModel):
    runtime: str | None = Field(
        default=None,
        description="Runtime name, e.g. llamacpp or transformers",
    )
    model: str | None = Field(
        default=None,
        description="Model ref name, e.g. gemma4-e2b or minilm-l6",
    )


class TextRequest(RuntimeOptions):
    text: str = Field(..., min_length=1, description="Input text to process")


class SummarizeRequest(TextRequest):
    pass


class SummarizeResponse(BaseModel):
    summary: str


class ClassifyRequest(TextRequest):
    labels: list[str] = Field(..., min_length=1)
    label_descriptions: dict[str, str] | None = None
    prompt: str | None = None


class ClassifyResponse(BaseModel):
    label: str
    confidence: float
    all_scores: dict[str, float]


class RedactPiiRequest(BaseModel):
    text: str = Field(..., min_length=1)
    backend: str = Field(default="gliner", description="gliner or openai-privacy")
    labels: list[str] | None = None


class PiiEntityResponse(BaseModel):
    entity_type: str
    text: str
    start: int
    end: int
    replacement: str


class RedactPiiResponse(BaseModel):
    original_text: str
    redacted_text: str
    entities_found: list[PiiEntityResponse]
    redaction_map: dict[str, str]
    backend_used: str


class EmbedRequest(TextRequest):
    pass


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


class ExtractInvoiceRequest(RuntimeOptions):
    text: str = Field(
        ...,
        min_length=1,
        description="Invoice text content (PDF path support is library-side)",
    )


class LineItemResponse(BaseModel):
    description: str | None = None
    quantity: float | None = None
    unit_price: float | None = None
    amount: float | None = None


class ExtractInvoiceResponse(BaseModel):
    vendor: str
    line_items: list[dict]
    subtotal: float
    tax: float
    total: float
    due_date: str | None = None
    payment_terms: str | None = None


class ErrorResponse(BaseModel):
    detail: str
