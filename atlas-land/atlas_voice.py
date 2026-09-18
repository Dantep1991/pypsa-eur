"""Standalone Nohm-compatible voice transport for the local ATLAS demo.

The production Nohm platform already exposes equivalent routes under
``/api/nohm/voice``.  ATLAS uses this small Flask blueprint while it is run as
a standalone product so the browser receives only short-lived Realtime client
secrets and never the server API key.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from typing import Any

import requests
from flask import Blueprint, Response, current_app, jsonify, request


VOICE_BLUEPRINT = Blueprint("atlas_voice", __name__, url_prefix="/api/voice")

KOKORO_BASE_URL = os.getenv("NOHM_TTS_BASE_URL", "http://127.0.0.1:8021").rstrip("/")
REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"
OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech"
OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions"

REALTIME_TRANSCRIPTION_MODEL = (
    os.getenv("NOHM_LIVE_TRANSCRIPTION_MODEL", "gpt-live-transcribe").strip()
    or "gpt-live-transcribe"
)
OPENAI_STT_MODEL = os.getenv("NOHM_STT_OPENAI_FALLBACK_MODEL", "gpt-4o-mini-transcribe").strip()
OPENAI_TTS_MODEL = os.getenv("NOHM_OPENAI_TTS_MODEL", "gpt-4o-mini-tts").strip()
VOICE_LANGUAGE = os.getenv("NOHM_VOICE_LANGUAGE", "").strip()

EMIL_KOKORO_PROFILE = {
    "voice": "am_michael",
    "speed": 0.94,
    "gender": "male",
}

VOICE_PROMPT = (
    "Transcribe clear user speech for EMIL in Nohm Atlas. Preserve place names, "
    "country names, energy-system terminology, NUTS1, NUTS2, NUTS3, bidding zone, "
    "e-Highway, PyPSA, electricity, methane, hydrogen, water, supply, demand, storage, "
    "grid, generation, capacity, granularity, radius, kilometres, and model-solving commands. "
    "Do not invent words when the audio is silence or background noise."
)

VOICE_KEYWORDS = [
    "Nohm Atlas", "EMIL", "PyPSA", "France", "Belgium", "Spain", "Portugal",
    "Germany", "Italy", "Great Britain", "United Kingdom", "Ireland", "Netherlands",
    "Luxembourg", "Switzerland", "Austria", "Czechia", "Slovakia", "Poland",
    "Denmark", "Norway", "Sweden", "Finland", "Estonia", "Latvia", "Lithuania",
    "Slovenia", "Croatia", "Bosnia and Herzegovina", "Serbia", "Montenegro", "Kosovo",
    "North Macedonia", "Albania", "Greece", "Bulgaria", "Romania", "Hungary", "Moldova",
    "Ukraine", "Turkey", "Iberian Peninsula", "Baltics", "Balkans", "NUTS1", "NUTS2",
    "NUTS3", "bidding zone", "e-Highway", "electricity", "methane", "hydrogen", "water",
    "oil and liquids", "grid", "supply", "generation", "demand", "storage", "Natura 2000",
]


def _api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def _clean_spoken_text(value: object, limit: int = 1600) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}."


def _safe_identifier() -> str:
    seed = os.getenv("COMPUTERNAME", "local-atlas")
    return hashlib.sha256(f"nohm-atlas:{seed}".encode("utf-8")).hexdigest()


def _openai_headers(*, json_content: bool = True) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {_api_key()}",
        "OpenAI-Safety-Identifier": _safe_identifier(),
    }
    if json_content:
        headers["Content-Type"] = "application/json"
    return headers


def _clean_keywords(values: object) -> list[str]:
    candidates = values if isinstance(values, list) else VOICE_KEYWORDS
    cleaned: list[str] = []
    for value in candidates[:100]:
        keyword = re.sub(r"[\r\n<>]+", " ", str(value or "")).strip()[:80]
        if keyword and keyword not in cleaned:
            cleaned.append(keyword)
    return cleaned


def _upload_transcription_context() -> tuple[str, str]:
    """Return a bounded Audio API prompt and optional language from multipart input."""
    client_prompt = _clean_spoken_text(request.form.get("prompt"), limit=1000)
    raw_keywords = request.form.get("keywords", "")
    try:
        parsed_keywords = json.loads(raw_keywords) if raw_keywords else []
    except (TypeError, ValueError):
        parsed_keywords = []
    keywords = _clean_keywords(parsed_keywords if isinstance(parsed_keywords, list) else [])
    parts = [VOICE_PROMPT]
    if client_prompt:
        parts.append(f"Atlas task context: {client_prompt}")
    if keywords:
        parts.append(f"Expected exact terms include: {', '.join(keywords)}.")
    prompt = _clean_spoken_text(" ".join(parts), limit=2000)
    requested_language = re.sub(r"[^a-zA-Z-]", "", str(request.form.get("language") or ""))[:12].lower()
    return prompt, (VOICE_LANGUAGE or requested_language)


def _realtime_session(
    *,
    language: str = "",
    prompt: str = "",
    keywords: object = None,
    delay: str = "medium",
) -> dict[str, Any]:
    """Build the dedicated Nohm/OpenAI transcription session used by Atlas."""
    chosen_delay = delay if delay in {"minimal", "low", "medium", "high", "xhigh"} else "medium"
    transcription: dict[str, Any] = {
        "model": REALTIME_TRANSCRIPTION_MODEL,
        "prompt": _clean_spoken_text(prompt or VOICE_PROMPT, limit=1000),
        "keywords": _clean_keywords(keywords),
        "delay": chosen_delay,
    }
    chosen_language = (VOICE_LANGUAGE or language).strip().lower()
    if chosen_language:
        transcription["languages"] = [chosen_language]
    return {
        "type": "transcription",
        "audio": {
            "input": {
                "noise_reduction": {"type": os.getenv("NOHM_REALTIME_NOISE_REDUCTION", "near_field")},
                "transcription": transcription,
                # Atlas commits turns from its local audio meter. That keeps
                # pause behavior consistent on the standalone and Nohm routes.
                "turn_detection": None,
            },
        },
    }


def _kokoro_health() -> dict[str, Any]:
    try:
        response = requests.get(f"{KOKORO_BASE_URL}/health", timeout=(1.5, 3.0))
        payload = response.json() if response.content else {}
        return payload if isinstance(payload, dict) else {"ready": False, "status": "invalid_response"}
    except (requests.RequestException, ValueError):
        return {"ready": False, "status": "unavailable"}


def _provider_error(status_code: int) -> str:
    """Never forward an upstream body that may echo an API key or audio text."""
    if status_code in {401, 403}:
        return "The server's Nohm speech-provider connection was rejected. This is not a user-login error."
    if status_code == 429:
        return "The speech provider is rate-limited or has reached its usage limit. Please retry later."
    if status_code >= 500:
        return "The speech provider is temporarily unavailable. Please retry."
    return "The speech provider rejected this request. Check the server's voice configuration."


def _provider_failure(status_code: int) -> dict[str, Any]:
    """Return a safe, machine-readable failure without forwarding provider data."""
    rejected = status_code in {401, 403}
    return {
        "error": _provider_error(status_code),
        "code": "voice_provider_rejected" if rejected else "voice_provider_unavailable",
        # Both Realtime and upload transcription use the same server-owned key.
        # Offering upload as a fallback after an auth rejection only records the
        # user a second time before failing for the same reason.
        "fallback_available": not rejected,
        "retryable": status_code == 429 or status_code >= 500,
    }


@VOICE_BLUEPRINT.after_request
def _voice_no_store(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    return response


@VOICE_BLUEPRINT.get("/status")
def voice_status() -> Response:
    kokoro = _kokoro_health()
    has_key = bool(_api_key())
    return jsonify({
        "scope": "configuration",
        "provider_verified": False,
        "ready": bool(has_key and (kokoro.get("ready") or OPENAI_TTS_MODEL)),
        "realtime": {
            "ready": has_key,
            "model": None,
            "transcription_model": REALTIME_TRANSCRIPTION_MODEL,
            "turn_detection": {"type": "client_vad"},
        },
        "tts": {
            "ready": bool(kokoro.get("ready") or has_key),
            "preferred_provider": "kokoro",
            "active_provider": "kokoro" if kokoro.get("ready") else "openai" if has_key else "none",
            "voice": EMIL_KOKORO_PROFILE["voice"] if kokoro.get("ready") else "onyx",
            "kokoro": kokoro,
        },
        "upload_stt": {"ready": has_key, "model": OPENAI_STT_MODEL},
    })


@VOICE_BLUEPRINT.post("/realtime/client-secret")
def create_realtime_client_secret() -> Response:
    if not _api_key():
        return jsonify({"error": "OpenAI API key is not configured"}), 503

    body = request.get_json(silent=True) or {}
    started = time.perf_counter()
    try:
        response = requests.post(
            REALTIME_CLIENT_SECRETS_URL,
            headers=_openai_headers(),
            json={"session": _realtime_session(
                language=str(body.get("language") or ""),
                prompt=str(body.get("prompt") or ""),
                keywords=body.get("keywords"),
                delay=str(body.get("delay") or "medium").lower(),
            )},
            timeout=(5.0, 20.0),
        )
    except requests.RequestException as exc:
        current_app.logger.warning("Realtime client-secret request failed: %s", type(exc).__name__)
        return jsonify({"error": "OpenAI Realtime client-secret request failed"}), 502

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.status_code >= 400:
        return jsonify(_provider_failure(response.status_code)), 502

    if not isinstance(payload, dict):
        return jsonify({"error": "OpenAI Realtime returned an invalid response"}), 502
    nested = payload.get("client_secret")
    nested = nested if isinstance(nested, dict) else {}
    value = payload.get("value") or nested.get("value")
    expires_at = payload.get("expires_at") or nested.get("expires_at")
    if not isinstance(value, str) or not value.strip():
        return jsonify({"error": "OpenAI Realtime did not return a client secret"}), 502

    result = jsonify({
        "value": value,
        "expires_at": expires_at,
        "session": payload.get("session") or nested.get("session"),
        "model": None,
        "transcription_model": REALTIME_TRANSCRIPTION_MODEL,
        "mode": "transcription",
        "assistant": "emil",
        "calls_url": "https://api.openai.com/v1/realtime/calls",
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
    })
    result.headers["Cache-Control"] = "no-store"
    return result


@VOICE_BLUEPRINT.post("/speak")
def speak() -> Response:
    body = request.get_json(silent=True) or {}
    text = _clean_spoken_text(body.get("text"))
    if not text:
        return jsonify({"error": "Text is required"}), 400

    try:
        kokoro_response = requests.post(
            f"{KOKORO_BASE_URL}/synthesize",
            json={
                "text": text,
                "voice": EMIL_KOKORO_PROFILE["voice"],
                "speed": EMIL_KOKORO_PROFILE["speed"],
                "format": "wav",
            },
            timeout=(2.0, 30.0),
        )
        if kokoro_response.ok and kokoro_response.content:
            return Response(
                kokoro_response.content,
                mimetype=(kokoro_response.headers.get("Content-Type") or "audio/wav").split(";", 1)[0],
                headers={
                    "Cache-Control": "no-store",
                    "X-Nohm-Assistant": "emil",
                    "X-Nohm-Voice-Provider": "kokoro",
                    "X-Nohm-Kokoro-Voice": EMIL_KOKORO_PROFILE["voice"],
                },
            )
    except requests.RequestException as exc:
        current_app.logger.info("Kokoro unavailable; falling back to OpenAI speech: %s", type(exc).__name__)

    if not _api_key():
        return jsonify({"error": "Kokoro is unavailable and OpenAI speech is not configured"}), 503
    try:
        openai_response = requests.post(
            OPENAI_SPEECH_URL,
            headers=_openai_headers(),
            json={
                "model": OPENAI_TTS_MODEL,
                "voice": "onyx",
                "input": text,
                "instructions": "Speak as EMIL: calm, concise, confident, and natural. Do not rush place names.",
                "response_format": "mp3",
            },
            timeout=(5.0, 45.0),
        )
    except requests.RequestException:
        return jsonify({"error": "Voice synthesis service is unavailable"}), 502
    if not openai_response.ok:
        return jsonify({"error": "OpenAI speech synthesis failed"}), 502
    return Response(
        openai_response.content,
        mimetype="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "X-Nohm-Assistant": "emil",
            "X-Nohm-Voice-Provider": "openai",
        },
    )


@VOICE_BLUEPRINT.post("/transcribe")
def transcribe() -> Response:
    """Upload-STT fallback for browsers or networks that cannot use WebRTC."""
    if not _api_key():
        return jsonify({"error": "OpenAI transcription is not configured"}), 503
    uploaded = request.files.get("file")
    if uploaded is None:
        return jsonify({"error": "Audio file is required"}), 400
    # Bound the read itself; checking only after read() permits unbounded RAM.
    data = uploaded.read(4_000_001)
    if not data:
        return jsonify({"text": ""})
    if len(data) > 4_000_000:
        return jsonify({"error": "Voice chunk is too large"}), 413

    started = time.perf_counter()
    filename = uploaded.filename or "atlas-voice.webm"
    content_type = uploaded.mimetype or "audio/webm"
    prompt, language = _upload_transcription_context()
    try:
        response = requests.post(
            OPENAI_TRANSCRIPTIONS_URL,
            headers=_openai_headers(json_content=False),
            data={
                "model": OPENAI_STT_MODEL,
                **({"language": language} if language else {}),
                "prompt": prompt,
                "response_format": "json",
            },
            files={"file": (filename, data, content_type)},
            timeout=(5.0, 60.0),
        )
    except requests.RequestException:
        return jsonify({"error": "Voice transcription service is unavailable"}), 502
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if not response.ok:
        return jsonify(_provider_failure(response.status_code)), 502
    if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
        return jsonify({"error": "The transcription provider returned an invalid response"}), 502
    return jsonify({
        "text": str(payload.get("text") or "").strip(),
        "provider": "openai",
        "model": OPENAI_STT_MODEL,
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
    })


def register_voice_blueprint(app: Any) -> None:
    """Register once so tests and the standalone runner can call this safely."""
    if VOICE_BLUEPRINT.name not in app.blueprints:
        app.register_blueprint(VOICE_BLUEPRINT)
