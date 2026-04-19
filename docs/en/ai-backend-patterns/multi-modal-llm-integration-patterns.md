---
id: 30019
title: Multi-modal LLM Integration Patterns
state: draft
slug: multi-modal-llm-integration-patterns
---

# [BEE-521] Multi-modal LLM Integration Patterns

:::info
Multi-modal LLMs accept images, audio, and documents alongside text. Integrating them correctly requires understanding how each modality is tokenized, priced, pre-processed, and passed to the API — because the decisions made at the ingestion layer determine both the quality of the model's output and the cost per request.
:::

## Context

Text-only LLMs dominated the first wave of production deployments. The shift to multi-modal models — triggered by GPT-4V (2023), Claude 3 (2024), and Gemini's native multi-modal architecture — expanded the input contract from a string of tokens to an arbitrarily ordered sequence of text, images, audio, and document chunks. This changed the integration layer substantially.

The underlying mechanism is the same across providers: a vision encoder (typically a ViT or a CLIP-derived model) converts image pixels into patch embeddings, which are projected into the same embedding space as text tokens and concatenated with the text sequence before the autoregressive decoder processes them. The consequence is that images consume token budget, carry a cost per pixel processed, and compete with text for the context window — all of which require explicit attention at the application layer.

Audio follows a different path: OpenAI's Whisper architecture converts speech to text before the language model sees it, while newer real-time architectures (GPT-4o Realtime, Gemini Live) process audio as a native modality end-to-end. The integration contract differs significantly between these two models.

## Design Thinking

Multi-modal integration adds three dimensions that pure text integration does not have:

**Modality pre-processing**: Images must be resized, reformatted, and optionally compressed before the API call. Sending a 12 MP raw JPEG when a 640×480 JPEG would suffice wastes tokens and increases latency. Audio must be in a supported container format and within duration limits.

**Token cost is not linear with file size**: A 100KB JPEG costs the same number of vision tokens as a 1MB JPEG of the same resolution. Token cost is determined by pixel dimensions, not file size. Understanding the provider's tiling or patch system is prerequisite to cost estimation.

**Content routing**: Not every document page benefits from vision. A page of machine-readable text is cheaper and more accurately processed by PDF text extraction than by vision. A scanned form or a chart must go to vision. Routing logic at the ingestion layer — vision vs text extraction — is often the highest-leverage optimization for document-heavy workloads.

## Best Practices

### Pre-process Images Before Sending

**MUST** resize images to the minimum resolution necessary for the task before encoding. Larger images consume more tokens and cost more; the model's accuracy on typical tasks does not improve beyond a moderate resolution:

```python
from PIL import Image
import io
import base64

def prepare_image(path: str, max_short_edge: int = 768) -> tuple[str, str]:
    """
    Resize to keep the short edge <= max_short_edge.
    Returns (base64_string, media_type).
    """
    img = Image.open(path).convert("RGB")
    w, h = img.size
    scale = min(1.0, max_short_edge / min(w, h))
    if scale < 1.0:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return b64, "image/jpeg"
```

**SHOULD** understand how each provider counts vision tokens before designing cost budgets:

| Provider | Billing model | Approximate tokens for 1024×1024 |
|----------|--------------|----------------------------------|
| OpenAI (`detail: high`) | 85 base + 170 per 512×512 tile | ~765 tokens |
| OpenAI (`detail: low`) | Flat 85 tokens regardless of size | 85 tokens |
| Anthropic (Claude 3.5+) | ~1,590 tokens for 1092×1092 | ~1,590 tokens |
| Google Gemini 1.5+ | 258 tokens per image (≤384px), up to 1,290 for full | ~1,290 tokens |

**SHOULD** use `detail: low` (OpenAI) for tasks that do not require fine-grained pixel detail — UI layout detection, high-level image classification, thumbnail identification. The cost difference is roughly 9× for a full-resolution image.

**MUST NOT** send images wider or taller than 8,000 pixels. Most providers reject or silently truncate beyond their maximum dimensions. Cap at 2,048px on the long edge for safety.

### Pass Images Using the Correct Content Block Structure

Both major providers embed images in the `messages` array as typed content blocks rather than as separate parameters. The structures differ:

```python
import anthropic
import openai

# Anthropic: image appears as a content block alongside text
anthropic_client = anthropic.Anthropic()

def analyze_with_claude(b64_image: str, media_type: str, question: str) -> str:
    response = anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,  # "image/jpeg", "image/png", etc.
                        "data": b64_image,
                    },
                },
                {"type": "text", "text": question},
            ],
        }],
    )
    return response.content[0].text


# OpenAI: image_url content type in the message
openai_client = openai.OpenAI()

def analyze_with_openai(b64_image: str, media_type: str, question: str) -> str:
    data_url = f"data:{media_type};base64,{b64_image}"
    response = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": data_url, "detail": "high"},
                },
                {"type": "text", "text": question},
            ],
        }],
    )
    return response.choices[0].message.content
```

**SHOULD** place images before the text that references them in the content array. Empirically, models attend more accurately to images that appear before the question than after — this mirrors how humans read: see first, then interpret.

**SHOULD** use URL references (passing a public HTTPS URL rather than base64) when the image is already hosted and publicly accessible. URL references skip the base64 encoding overhead and reduce request payload size:

```python
# URL-based reference — no base64 required
{"type": "image_url", "image_url": {"url": "https://example.com/chart.png", "detail": "high"}}
```

### Route Documents Between Text Extraction and Vision

**SHOULD** implement a routing layer that selects the appropriate processing path based on document content type:

```python
import pdfplumber

def process_document_page(pdf_path: str, page_num: int) -> dict:
    """
    Route each page to vision or text extraction based on content.
    Returns {"text": ..., "method": "extraction"|"vision"}.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_num]
        extracted_text = page.extract_text() or ""

    word_count = len(extracted_text.split())

    if word_count >= 50:
        # Sufficient machine-readable text — skip vision for this page
        return {"text": extracted_text, "method": "extraction"}
    else:
        # Scanned page, form, or diagram — send to vision
        from pdf2image import convert_from_path
        images = convert_from_path(pdf_path, first_page=page_num + 1, last_page=page_num + 1, dpi=150)
        b64, media_type = prepare_image_from_pil(images[0])
        vision_response = analyze_with_claude(b64, media_type, "Extract all text and describe any non-text content.")
        return {"text": vision_response, "method": "vision"}
```

**MUST NOT** send every page of a large PDF to vision. A 200-page document at ~1,590 tokens per vision page costs roughly 318,000 input tokens before the language model processes a single word of context. Text extraction costs zero tokens.

**SHOULD** set DPI between 100 and 200 when converting PDF pages to images for vision. DPI 72 produces pixelated output that degrades OCR quality; DPI above 200 inflates image dimensions beyond what the model can utilize.

### Transcribe Audio with the Speech-to-Text API

**SHOULD** use Whisper for transcription before passing speech content to an LLM, unless real-time speech interaction is required:

```python
from openai import OpenAI

client = OpenAI()

def transcribe_audio(audio_path: str, language: str = None) -> str:
    """
    Transcribe an audio file. Supported: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm.
    Max file size: 25MB.
    """
    with open(audio_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language=language,     # ISO-639-1 code; None lets Whisper detect
            response_format="text",
        )
    return transcript


def transcribe_and_analyze(audio_path: str, system_prompt: str) -> str:
    """Full pipeline: transcribe, then send text to the LLM."""
    transcript = transcribe_audio(audio_path)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": transcript},
        ],
    )
    return response.choices[0].message.content
```

**MUST** chunk audio files larger than 25 MB before sending to the transcription API. Overlap chunks by 2–3 seconds to avoid cutting words at segment boundaries:

```python
from pydub import AudioSegment

def chunk_audio(path: str, chunk_ms: int = 60_000, overlap_ms: int = 2_000) -> list[AudioSegment]:
    audio = AudioSegment.from_file(path)
    chunks = []
    start = 0
    while start < len(audio):
        end = min(start + chunk_ms, len(audio))
        chunks.append(audio[start:end])
        start += chunk_ms - overlap_ms
    return chunks
```

### Reuse Image Assets with the Files API

When the same image appears in multiple requests (a logo in every invoice, a standard form template), uploading it repeatedly inflates both payload size and latency. The Anthropic Files API and similar upload endpoints let you upload once and reference by ID:

```python
import anthropic

client = anthropic.Anthropic()

def upload_image_once(path: str) -> str:
    """Upload image and return file_id for reuse across requests."""
    with open(path, "rb") as f:
        response = client.beta.files.upload(
            file=(path.split("/")[-1], f, "image/png"),
        )
    return response.id  # e.g., "file_abc123"


def analyze_with_file_id(file_id: str, question: str) -> str:
    response = client.beta.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "file", "file_id": file_id},
                },
                {"type": "text", "text": question},
            ],
        }],
        betas=["files-api-2025-04-14"],
    )
    return response.content[0].text
```

**SHOULD** cache file IDs and reuse them for the duration the file remains on the provider's servers. This reduces request payload from kilobytes (base64) to a short string.

### Handle Multi-modal Errors Explicitly

**MUST** handle content policy rejections on images separately from other API errors. Vision models apply content classifiers (SafeSearch equivalent) and may refuse to process images containing certain content:

```python
def safe_vision_call(b64_image: str, media_type: str, question: str) -> dict:
    try:
        text = analyze_with_claude(b64_image, media_type, question)
        return {"ok": True, "text": text}
    except anthropic.BadRequestError as e:
        if "image" in str(e).lower() or "content" in str(e).lower():
            return {"ok": False, "error": "content_policy", "detail": str(e)}
        raise
    except anthropic.APIError as e:
        if "Could not process image" in str(e):
            return {"ok": False, "error": "unsupported_format", "detail": str(e)}
        raise
```

**MUST NOT** log or persist the base64 content of images in error logs. Base64-encoded images can be arbitrarily large and may contain personal or sensitive content.

**SHOULD** validate image format and dimensions before the API call to catch common rejection reasons early:

```python
from PIL import Image
import io

def validate_image(data: bytes) -> None:
    """Raise ValueError for images the API is likely to reject."""
    img = Image.open(io.BytesIO(data))
    w, h = img.size
    if w > 8000 or h > 8000:
        raise ValueError(f"Image {w}×{h} exceeds 8000px limit")
    if img.format not in ("JPEG", "PNG", "GIF", "WEBP"):
        raise ValueError(f"Unsupported format: {img.format}")
    if len(data) > 20 * 1024 * 1024:  # 20MB conservative limit
        raise ValueError("Image exceeds size limit")
```

## Visual

```mermaid
flowchart TD
    Input["Incoming content\n(image, audio, PDF, URL)"]
    Type{Content type?}
    PDF["PDF / Document"]
    Image["Image"]
    Audio["Audio"]

    HasText{Has machine-readable\ntext? (≥50 words)}
    Extract["Text extraction\n(zero vision tokens)"]
    VisionPDF["PDF→image conversion\n(dpi=150) + vision"]

    Resize["Resize: short edge ≤ 768px\nJPEG quality=85"]
    FileID{Already uploaded?}
    Upload["Files API upload\n→ cache file_id"]
    VisionCall["Vision API call\n(image content block)"]

    Whisper["Whisper transcription\n→ text"]
    LLM["LLM with assembled\ntext context"]

    Input --> Type
    Type -->|PDF| PDF
    Type -->|Image| Image
    Type -->|Audio| Audio

    PDF --> HasText
    HasText -->|yes| Extract
    HasText -->|no| VisionPDF
    Extract --> LLM
    VisionPDF --> LLM

    Image --> Resize
    Resize --> FileID
    FileID -->|no| Upload
    FileID -->|yes| VisionCall
    Upload --> VisionCall
    VisionCall --> LLM

    Audio --> Whisper
    Whisper --> LLM

    style Input fill:#1d3557,color:#fff
    style LLM fill:#2d6a4f,color:#fff
    style VisionCall fill:#457b9d,color:#fff
    style Whisper fill:#457b9d,color:#fff
    style Extract fill:#6d6875,color:#fff
    style Upload fill:#e67e22,color:#fff
```

## Related BEEs

- [BEE-30001](llm-api-integration-patterns.md) -- LLM API Integration Patterns: the retry, timeout, and client configuration patterns for text APIs apply equally to multi-modal calls; vision and audio endpoints share the same HTTP client
- [BEE-30010](llm-context-window-management.md) -- LLM Context Window Management: images consume significant portions of the context window; the same token budget discipline applies to multi-modal inputs
- [BEE-30011](ai-cost-optimization-and-model-routing.md) -- AI Cost Optimization and Model Routing: image token costs dwarf text token costs at scale; cost routing logic must account for vision token pricing when selecting models
- [BEE-30016](llm-streaming-patterns.md) -- LLM Streaming Patterns: multi-modal responses stream the same way as text responses; the first streamed token appears after the vision encoder finishes, introducing higher TTFT for image-heavy requests

## References

- [OpenAI. Vision — platform.openai.com](https://platform.openai.com/docs/guides/vision)
- [OpenAI. Speech to Text — platform.openai.com](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI. Text to Speech — developers.openai.com](https://developers.openai.com/api/docs/guides/text-to-speech)
- [Anthropic. Vision — platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/vision)
- [Anthropic. Files API — platform.claude.com](https://platform.claude.com/docs/en/build-with-claude/files)
- [Google. Gemini Image Understanding — ai.google.dev](https://ai.google.dev/gemini-api/docs/image-understanding)
- [OpenAI. GPT-4V System Card — cdn.openai.com](https://cdn.openai.com/papers/GPTV_System_Card.pdf)
- [Sebastian Raschka. Understanding Multimodal LLMs — magazine.sebastianraschka.com](https://magazine.sebastianraschka.com/p/understanding-multimodal-llms)
- [OpenAI. Whisper (open-source ASR) — github.com/openai/whisper](https://github.com/openai/whisper)
