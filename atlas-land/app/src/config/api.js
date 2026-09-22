// Hosted Atlas uses the Nohm origin and its authenticated API proxy. The local
// development server retains its separate Flask port. Hosts may configure the
// prefix at build time or before the bundle loads via window.__NOHM_ATLAS_API_BASE__.
export function resolveAtlasApiBase({ override, hostname = '', protocol = 'http:', port = '', pathname = '' } = {}) {
  if (typeof override === 'string') return override.trim().replace(/\/+$/, '');
  if (protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname) && port === '3000') {
    return 'http://127.0.0.1:5001';
  }
  // The Nohm local preview mounts Atlas at /atlas and routes its backend
  // through the dedicated /atlas-api proxy. Leaving this blank makes API
  // calls fall through to Nohm's unrelated generic /api service.
  // Preview ports are deliberately not fixed: isolated worktrees and CI smoke
  // runs each choose an available loopback port. Any loopback-hosted Atlas
  // frontend other than the legacy CRA :3000 server uses the same-origin
  // /atlas-api boundary supplied by its host.
  if (protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
      && port && (pathname === '/atlas' || pathname.startsWith('/atlas/'))) {
    return '/atlas-api';
  }
  return '';
}

export const API_BASE_URL = resolveAtlasApiBase({
  override: (typeof window !== 'undefined' ? window.__NOHM_ATLAS_API_BASE__ : undefined)
    ?? process.env.REACT_APP_API_URL,
  hostname: typeof window !== 'undefined' ? window.location.hostname : '',
  protocol: typeof window !== 'undefined' ? window.location.protocol : '',
  port: typeof window !== 'undefined' ? window.location.port : '',
  pathname: typeof window !== 'undefined' ? window.location.pathname : '',
});

export function atlasApiUrl(path, apiBase = API_BASE_URL) {
  const suffix = String(path || '').trim();
  if (!suffix.startsWith('/')) throw new Error('Atlas API paths must be absolute.');
  return `${String(apiBase || '').replace(/\/+$/, '')}${suffix}`;
}

// API endpoints
export const ENDPOINTS = {
  PARSE_LOCATION: '/parse_location',
};

// API request timeout (in milliseconds)
export const REQUEST_TIMEOUT = 10000;
