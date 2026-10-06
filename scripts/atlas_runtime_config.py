"""Portable, side-effect-free configuration for the combined Atlas launcher."""

import os
import sys
from pathlib import Path


def configure_atlas_preview_origin(environ=None):
    """Bind an explicitly configured local preview to its exact browser origin.

    Preserve deployment origins, but never infer a port from incoming requests
    or trust all loopback websites. The static preview host only serves 127.0.0.1.
    """
    environ = os.environ if environ is None else environ
    configured = environ.get("NOHM_ATLAS_PREVIEW_PORT", "").strip()
    if not configured:
        return None
    if not configured.isascii() or not configured.isdecimal() or not 1 <= int(configured) <= 65535:
        raise ValueError("NOHM_ATLAS_PREVIEW_PORT must be an integer between 1 and 65535")
    origin = f"http://127.0.0.1:{int(configured)}"
    origins = [value.strip() for value in environ.get("NOHM_ATLAS_ALLOWED_ORIGINS", "").split(",") if value.strip()]
    if origin not in origins:
        origins.append(origin)
    environ["NOHM_ATLAS_ALLOWED_ORIGINS"] = ",".join(origins)
    return origin


def resolve_atlas_root(runner_root, environ=None):
    environ = os.environ if environ is None else environ
    configured = environ.get("NOHM_ATLAS_ROOT", "").strip()
    root = Path(configured).expanduser() if configured else Path(runner_root).parent / "Models" / "2026" / "nova-energy-analyst"
    root = root.resolve()
    if not (root / "app.py").is_file():
        raise RuntimeError("Atlas backend was not found. Set NOHM_ATLAS_ROOT to the directory containing app.py.")
    return root


def load_shared_nohm_key(environ=None):
    """Load only an explicitly configured file; never replace a deployed key."""
    environ = os.environ if environ is None else environ
    if environ.get("OPENAI_API_KEY", "").strip():
        return False
    configured = environ.get("NOHM_OPENAI_ENV_FILE", "").strip()
    if not configured:
        return False
    path = Path(configured).expanduser()
    if not path.is_file():
        raise RuntimeError("NOHM_OPENAI_ENV_FILE is configured but is not a readable file")
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() == "OPENAI_API_KEY" and value.strip():
            environ["OPENAI_API_KEY"] = value.strip().strip('"').strip("'")
            return True
    raise RuntimeError("NOHM_OPENAI_ENV_FILE does not define OPENAI_API_KEY")


def configure_nohm_platform_path(environ=None):
    """Expose an explicitly selected Nohm checkout, without copying any secrets.

    An integrated host may already provide the shared package on PYTHONPATH.
    Never search drives for it or replace an unrelated, already imported src.
    This must run once at startup, before request handling begins.
    """
    environ = os.environ if environ is None else environ
    configured = environ.get("NOHM_PLATFORM_ROOT", "").strip()
    if not configured:
        return None
    root = Path(configured).expanduser().resolve()
    if not (root / "src" / "ai" / "llm_calls" / "llm_client.py").is_file():
        raise RuntimeError("NOHM_PLATFORM_ROOT must point to the Nohm checkout containing src/ai/llm_calls/llm_client.py")
    imported = sys.modules.get("src")
    if imported is not None:
        package_paths = getattr(imported, "__path__", ())
        if {Path(path).resolve() for path in package_paths} != {root / "src"}:
            raise RuntimeError("An unrelated src package is already imported; configure NOHM_PLATFORM_ROOT before starting Atlas")
    path = str(root)
    sys.path[:] = [path, *(entry for entry in sys.path if entry != path)]
    return root


def load_shared_nohm_voice_key():
    """Reuse Nohm's existing speech secret resolver before legacy dotenv loads.

    Explicit deployment environment/file settings retain precedence. Only the
    shared Nohm helper reads its own configuration; Atlas never copies key files.
    """
    if os.environ.get("OPENAI_API_KEY", "").strip():
        return False
    try:
        from src.shared.secrets import ensure_provider_env
    except ImportError:
        return False
    return bool(ensure_provider_env("openai"))


def server_options(environ=None):
    environ = os.environ if environ is None else environ

    def integer(name, default, minimum, maximum):
        try:
            value = int(environ.get(name, default))
        except (ValueError, TypeError):
            raise ValueError(f"{name} must be an integer between {minimum} and {maximum}") from None
        if not minimum <= value <= maximum:
            raise ValueError(f"{name} must be between {minimum} and {maximum}")
        return value

    return {
        # Deliberately not configurable to 0.0.0.0: the unauthenticated legacy
        # workspace API must not bypass Nohm's authenticated local proxy.
        "host": "127.0.0.1",
        "port": integer("NOHM_ATLAS_PORT", 5001, 1, 65535),
        "threads": integer("NOHM_ATLAS_THREADS", 8, 2, 32),
        "connection_limit": 100,
        "channel_timeout": 120,
        "clear_untrusted_proxy_headers": True,
        "ident": "Nohm Atlas",
    }
