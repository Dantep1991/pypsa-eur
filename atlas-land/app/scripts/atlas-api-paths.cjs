'use strict';

function atlasUpstreamPath(value) {
  try {
    const pathname = new URL(String(value || ''), 'http://127.0.0.1').pathname;
    return pathname.startsWith('/atlas-api/')
      ? pathname.slice('/atlas-api'.length)
      : pathname;
  } catch (_) {
    return '';
  }
}

function isLandAtlasApiPath(value) {
  return atlasUpstreamPath(value).startsWith('/api/atlas/land/');
}

module.exports = { atlasUpstreamPath, isLandAtlasApiPath };
