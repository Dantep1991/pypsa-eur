from __future__ import annotations

import io
import sys
from pathlib import Path

from flask import Flask
import pytest


ATLAS_LAND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ATLAS_LAND_ROOT))

import atlas_voice  # noqa: E402


class StubResponse:
    def __init__(self, *, status_code=200, payload=None, content=b"", headers=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.content = content
        self.headers = headers or {}
        self.ok = status_code < 400

    def json(self):
        return self._payload


def make_client():
    app = Flask(__name__)
    atlas_voice.register_voice_blueprint(app)
    return app.test_client()


def test_status_reports_realtime_and_emil_kokoro(monkeypatch):
    monkeypatch.setattr(atlas_voice, "_api_key", lambda: "configured")
    monkeypatch.setattr(atlas_voice, "_kokoro_health", lambda: {"ready": True, "device": "cuda"})
    response = make_client().get("/api/voice/status")
    payload = response.get_json()
    assert response.status_code == 200
    assert payload["realtime"]["ready"] is True
    assert payload["tts"]["active_provider"] == "kokoro"
    assert payload["tts"]["voice"] == "am_michael"
    assert payload["scope"] == "configuration"
    assert payload["provider_verified"] is False
    assert response.headers["Cache-Control"] == "no-store"


def test_realtime_secret_is_short_lived_and_transcription_only(monkeypatch):
    captured = {}
    monkeypatch.setattr(atlas_voice, "_api_key", lambda: "configured")

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["body"] = kwargs["json"]
        return StubResponse(payload={
            "value": "ephemeral-token",
            "expires_at": 12345,
            "session": {"id": "session-1"},
        })

    monkeypatch.setattr(atlas_voice.requests, "post", fake_post)
    response = make_client().post("/api/voice/realtime/client-secret", json={
        "assistant": "emil",
        "mode": "transcription",
        "prompt": "A European grid command mentioning France.",
        "keywords": ["France", "NUTS3"],
        "delay": "medium",
    })
    session = captured["body"]["session"]
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.get_json()["value"] == "ephemeral-token"
    assert session["type"] == "transcription"
    assert session["audio"]["input"]["turn_detection"] is None
    transcription = session["audio"]["input"]["transcription"]
    assert transcription["model"] == "gpt-live-transcribe"
    assert transcription["prompt"] == "A European grid command mentioning France."
    assert transcription["keywords"] == ["France", "NUTS3"]
    assert transcription["delay"] == "medium"
    assert captured["url"] == atlas_voice.REALTIME_CLIENT_SECRETS_URL


def test_realtime_secret_never_runs_without_server_key(monkeypatch):
    monkeypatch.setattr(atlas_voice, "_api_key", lambda: "")
    response = make_client().post("/api/voice/realtime/client-secret", json={})
    assert response.status_code == 503


def test_transcription_does_not_force_english_unless_configured(monkeypatch):
    monkeypatch.setattr(atlas_voice, "VOICE_LANGUAGE", "")
    assert "languages" not in atlas_voice._realtime_session()["audio"]["input"]["transcription"]
    monkeypatch.setattr(atlas_voice, "VOICE_LANGUAGE", "fr")
    assert atlas_voice._realtime_session()["audio"]["input"]["transcription"]["languages"] == ["fr"]


def test_realtime_transcription_context_is_bounded_and_sanitized():
    session = atlas_voice._realtime_session(
        prompt="x" * 1500,
        keywords=["France", "France", "bad<term>", "line\nbreak"] + [f"k{i}" for i in range(110)],
        delay="unsupported",
    )
    transcription = session["audio"]["input"]["transcription"]
    assert len(transcription["prompt"]) <= 1000
    assert transcription["delay"] == "medium"
    assert transcription["keywords"][:3] == ["France", "bad term", "line break"]
    assert len(transcription["keywords"]) <= 99
    assert all("<" not in value and ">" not in value and "\n" not in value for value in transcription["keywords"])


def test_speak_uses_nohm_emil_profile(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["body"] = kwargs["json"]
        return StubResponse(content=b"RIFF-audio", headers={"Content-Type": "audio/wav"})

    monkeypatch.setattr(atlas_voice.requests, "post", fake_post)
    response = make_client().post("/api/voice/speak", json={"text": "Spain is ready.", "assistant": "emil"})
    assert response.status_code == 200
    assert response.headers["X-Nohm-Voice-Provider"] == "kokoro"
    assert captured["url"].endswith("/synthesize")
    assert captured["body"]["voice"] == "am_michael"
    assert captured["body"]["speed"] == 0.94


def test_upload_transcription_validates_and_returns_text(monkeypatch):
    monkeypatch.setattr(atlas_voice, "_api_key", lambda: "configured")
    captured = {}

    def fake_post(url, **kwargs):
        assert url == atlas_voice.OPENAI_TRANSCRIPTIONS_URL
        assert kwargs["data"]["model"] == atlas_voice.OPENAI_STT_MODEL
        captured.update(kwargs["data"])
        return StubResponse(payload={"text": "show Iberia at NUTS3"})

    monkeypatch.setattr(atlas_voice.requests, "post", fake_post)
    response = make_client().post(
        "/api/voice/transcribe",
        data={
            "file": (io.BytesIO(b"not-really-audio"), "voice.webm"),
            "prompt": "A European infrastructure map command.",
            "keywords": '["France", "NUTS3"]',
            "language": "fr",
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 200
    assert response.get_json()["text"] == "show Iberia at NUTS3"
    assert "A European infrastructure map command" in captured["prompt"]
    assert "France, NUTS3" in captured["prompt"]
    assert captured["language"] == "fr"


@pytest.mark.parametrize('status', [400, 401, 403, 429, 500, 503])
@pytest.mark.parametrize('route', ['realtime/client-secret', 'transcribe'])
def test_upstream_errors_never_expose_provider_body_or_credentials(monkeypatch, status, route):
    monkeypatch.setattr(atlas_voice, '_api_key', lambda: 'test-private-key')
    calls = []
    def post(*args, **kwargs):
        calls.append(args)
        return StubResponse(status_code=status, payload={'error': {'message': 'test-private-key'}})
    monkeypatch.setattr(atlas_voice.requests, 'post', post)
    response = make_client().post('/api/voice/' + route,
        data={'file': (io.BytesIO(b'test-audio'), 'voice.webm')} if route == 'transcribe' else {})
    assert response.status_code == 502
    payload = response.get_json()
    assert 'test-private-key' not in response.get_data(as_text=True)
    assert response.headers['Cache-Control'] == 'no-store'
    assert payload['code'] == ('voice_provider_rejected' if status in {401, 403} else 'voice_provider_unavailable')
    assert payload['fallback_available'] is (status not in {401, 403})
    assert payload['retryable'] is (status == 429 or status >= 500)
    assert len(calls) == 1


@pytest.mark.parametrize('payload', [[], 'invalid', {'client_secret': 'invalid'}, {'value': 123}, {}])
def test_invalid_successful_secret_response_is_not_a_crash(monkeypatch, payload):
    monkeypatch.setattr(atlas_voice, '_api_key', lambda: 'configured')
    monkeypatch.setattr(atlas_voice.requests, 'post', lambda *a, **kw: StubResponse(payload=payload))
    response = make_client().post('/api/voice/realtime/client-secret')
    assert response.status_code == 502
    assert 'error' in response.get_json()


@pytest.mark.parametrize('payload', [[], 'invalid', {}, {'text': 12}])
def test_invalid_transcription_response_is_not_successful_empty_speech(monkeypatch, payload):
    monkeypatch.setattr(atlas_voice, '_api_key', lambda: 'configured')
    monkeypatch.setattr(atlas_voice.requests, 'post', lambda *a, **kw: StubResponse(payload=payload))
    response = make_client().post('/api/voice/transcribe',
        data={'file': (io.BytesIO(b'test-audio'), 'voice.webm')})
    assert response.status_code == 502


def test_network_exception_does_not_leak_a_secret_in_logs(monkeypatch, caplog):
    monkeypatch.setattr(atlas_voice, '_api_key', lambda: 'configured')
    def fail(*args, **kwargs):
        raise atlas_voice.requests.RequestException('test-private-key')
    monkeypatch.setattr(atlas_voice.requests, 'post', fail)
    response = make_client().post('/api/voice/realtime/client-secret')
    assert response.status_code == 502
    assert 'test-private-key' not in response.get_data(as_text=True) + caplog.text
