// Public data files must follow the same asset base as the compiled JS/CSS.
// Keep this independent of the API proxy prefix: a Nohm host can mount each
// at a different path (or serve static assets from a CDN).
export function atlasAssetUrl(path, publicUrl = process.env.PUBLIC_URL || '') {
  return `${publicUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
