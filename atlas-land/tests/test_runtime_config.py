import importlib.util
import builtins
import os
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest


SPEC = importlib.util.spec_from_file_location(
    "atlas_runtime_config", Path(__file__).resolve().parents[2] / "scripts" / "atlas_runtime_config.py",
)
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


def test_preview_origin_is_not_enabled_without_explicit_preview_port():
    env = {'NOHM_ATLAS_ALLOWED_ORIGINS': 'https://nohm.example'}
    assert runtime.configure_atlas_preview_origin(env) is None
    assert env == {'NOHM_ATLAS_ALLOWED_ORIGINS': 'https://nohm.example'}


def test_preview_uses_exact_configured_origin_and_retains_existing_origins():
    env = {'NOHM_ATLAS_PREVIEW_PORT': '3207', 'NOHM_ATLAS_ALLOWED_ORIGINS': 'https://nohm.example'}
    assert runtime.configure_atlas_preview_origin(env) == 'http://127.0.0.1:3207'
    assert runtime.configure_atlas_preview_origin(env) == 'http://127.0.0.1:3207'
    assert env['NOHM_ATLAS_ALLOWED_ORIGINS'] == 'https://nohm.example,http://127.0.0.1:3207'


def test_dedicated_preview_does_not_trust_other_loopback_ports():
    env = {'NOHM_ATLAS_PREVIEW_PORT': '3207'}
    runtime.configure_atlas_preview_origin(env)
    assert env['NOHM_ATLAS_ALLOWED_ORIGINS'] == 'http://127.0.0.1:3207'


@pytest.mark.parametrize('port', ['0', '65536', '*', '3207.evil.example', '3207/evil', '-1', '１２３４'])
def test_invalid_preview_port_fails_closed_without_mutating_origins(port):
    env = {'NOHM_ATLAS_PREVIEW_PORT': port, 'NOHM_ATLAS_ALLOWED_ORIGINS': 'https://nohm.example'}
    with pytest.raises(ValueError, match='NOHM_ATLAS_PREVIEW_PORT'):
        runtime.configure_atlas_preview_origin(env)
    assert env['NOHM_ATLAS_ALLOWED_ORIGINS'] == 'https://nohm.example'


def test_portable_sibling_layout(tmp_path):
    backend = tmp_path / 'Models' / '2026' / 'nova-energy-analyst'
    backend.mkdir(parents=True)
    (backend / 'app.py').touch()
    assert runtime.resolve_atlas_root(tmp_path / 'PyPSA EUr', {}) == backend.resolve()


def test_explicit_backend_root(tmp_path):
    (tmp_path / 'app.py').touch()
    assert runtime.resolve_atlas_root('/unused', {'NOHM_ATLAS_ROOT': str(tmp_path)}) == tmp_path.resolve()


def test_missing_backend_has_actionable_error(tmp_path):
    with pytest.raises(RuntimeError, match='NOHM_ATLAS_ROOT'):
        runtime.resolve_atlas_root(tmp_path, {})


def test_deployed_key_is_not_overwritten_even_with_invalid_shared_file():
    environ = {'OPENAI_API_KEY': 'test-deployed', 'NOHM_OPENAI_ENV_FILE': '/missing/file'}
    assert runtime.load_shared_nohm_key(environ) is False
    assert environ['OPENAI_API_KEY'] == 'test-deployed'


def test_no_implicit_credential_file_search():
    environ = {}
    assert runtime.load_shared_nohm_key(environ) is False
    assert environ == {}


def test_no_implicit_platform_discovery():
    before = list(sys.path)
    assert runtime.configure_nohm_platform_path({}) is None
    assert sys.path == before


def test_explicit_platform_path_is_added_once_without_loading_secrets(tmp_path, monkeypatch):
    client = tmp_path / 'src/ai/llm_calls/llm_client.py'
    client.parent.mkdir(parents=True)
    client.write_text('raise AssertionError("startup must not execute the client")', encoding='utf-8')
    monkeypatch.delitem(sys.modules, 'src', raising=False)
    monkeypatch.setattr(sys, 'path', list(sys.path))
    env = {'NOHM_PLATFORM_ROOT': str(tmp_path)}
    assert runtime.configure_nohm_platform_path(env) == tmp_path.resolve()
    assert runtime.configure_nohm_platform_path(env) == tmp_path.resolve()
    assert sys.path.count(str(tmp_path.resolve())) == 1
    assert sys.path[0] == str(tmp_path.resolve())
    assert set(env) == {'NOHM_PLATFORM_ROOT'}


def test_invalid_platform_root_fails_without_path_mutation(tmp_path):
    before = list(sys.path)
    with pytest.raises(RuntimeError, match='NOHM_PLATFORM_ROOT'):
        runtime.configure_nohm_platform_path({'NOHM_PLATFORM_ROOT': str(tmp_path)})
    assert sys.path == before


def test_already_imported_unrelated_src_is_never_replaced(tmp_path, monkeypatch):
    client = tmp_path / 'src/ai/llm_calls/llm_client.py'
    client.parent.mkdir(parents=True)
    client.touch()
    other = SimpleNamespace(__path__=[str(tmp_path / 'unrelated')])
    monkeypatch.setitem(sys.modules, 'src', other)
    with pytest.raises(RuntimeError, match='unrelated src'):
        runtime.configure_nohm_platform_path({'NOHM_PLATFORM_ROOT': str(tmp_path)})
    assert sys.modules['src'] is other


def test_shared_voice_resolver_runs_before_legacy_dotenv_defaults(tmp_path, monkeypatch):
    from dotenv import load_dotenv
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    calls = []
    def ensure(provider):
        calls.append(provider)
        monkeypatch.setenv('OPENAI_API_KEY', 'test-nohm-speech')
        return 'test-nohm-speech'
    monkeypatch.setitem(sys.modules, 'src.shared.secrets', SimpleNamespace(ensure_provider_env=ensure))
    assert runtime.load_shared_nohm_voice_key() is True
    legacy = tmp_path / 'legacy.env'
    legacy.write_text('OPENAI_API_KEY=test-legacy-placeholder\n', encoding='utf-8')
    load_dotenv(legacy)
    assert os.environ['OPENAI_API_KEY'] == 'test-nohm-speech'
    assert calls == ['openai']


def test_shared_voice_never_overrides_explicit_deployment(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-deployed')
    monkeypatch.setitem(sys.modules, 'src.shared.secrets', SimpleNamespace())
    assert runtime.load_shared_nohm_voice_key() is False
    assert os.environ['OPENAI_API_KEY'] == 'test-deployed'


def test_standalone_without_nohm_preserves_legacy_voice_configuration(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    original = builtins.__import__
    def missing(name, *args, **kwargs):
        if name == 'src.shared.secrets':
            raise ModuleNotFoundError(name)
        return original(name, *args, **kwargs)
    monkeypatch.setattr(builtins, '__import__', missing)
    assert runtime.load_shared_nohm_voice_key() is False
    assert 'OPENAI_API_KEY' not in os.environ


def test_only_explicit_key_is_loaded(tmp_path):
    path = tmp_path / 'example.env'
    path.write_text('# fixture only\nUNRELATED_KEY=unused\nOPENAI_API_KEY="test-shared"\n', encoding='utf-8-sig')
    environ = {'NOHM_OPENAI_ENV_FILE': str(path)}
    assert runtime.load_shared_nohm_key(environ) is True
    assert environ['OPENAI_API_KEY'] == 'test-shared'
    assert 'UNRELATED_KEY' not in environ


def test_server_is_loopback_only_with_bounded_concurrency():
    options = runtime.server_options({'NOHM_ATLAS_HOST': '0.0.0.0'})
    assert options['host'] == '127.0.0.1'
    assert options['threads'] == 8
    assert options['port'] == 5001


@pytest.mark.parametrize('setting,value', [('NOHM_ATLAS_PORT', '0'), ('NOHM_ATLAS_PORT', '65536'),
                                          ('NOHM_ATLAS_THREADS', '0'), ('NOHM_ATLAS_THREADS', '64'),
                                          ('NOHM_ATLAS_THREADS', 'many')])
def test_invalid_server_settings_fail_early(setting, value):
    with pytest.raises(ValueError, match=setting):
        runtime.server_options({setting: value})
