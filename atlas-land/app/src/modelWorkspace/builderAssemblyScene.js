import { atlasApiUrl } from '../config/api';
import { adaptModelScene } from './modelScene';


const text = (value) => String(value ?? '').trim();

export function builderAssemblySceneRequestUrl(preview) {
  const projectId = text(preview?.projectId);
  const draftId = text(preview?.draftId);
  const sourceVersion = text(preview?.sourceVersion);
  const previewId = text(preview?.assembly?.previewId);
  const revision = Number(preview?.revision);
  if (preview?.mode !== 'assembled-summary' || preview?.geometryStatus !== 'resolved-preview'
      || preview?.assembly?.sceneAvailable !== true || !projectId || !draftId || !sourceVersion
      || !/^[a-f0-9]{32}$/u.test(previewId) || !Number.isSafeInteger(revision) || revision < 1) return null;
  const query = new URLSearchParams({ source_version: sourceVersion, draft_revision: String(revision) });
  return `/api/atlas/projects/${encodeURIComponent(projectId)}/builder-drafts/${encodeURIComponent(draftId)}/assembly/${previewId}/scene?${query.toString()}`;
}

export async function fetchBuilderAssemblyScene(preview, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = builderAssemblySceneRequestUrl(preview);
  if (!url) throw new Error('An exact completed Model Builder assembly is required for a draft map preview.');
  const response = await fetchImpl(atlasApiUrl(url, options.apiBase), {
    signal: options.signal,
    credentials: 'same-origin',
  });
  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new Error(`Atlas could not read the temporary assembly scene (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(typeof payload?.detail === 'string' ? payload.detail : `Temporary assembly scene returned HTTP ${response.status}.`);
  }
  if (payload?.temporary !== true
      || payload.project_id !== preview.projectId
      || payload.draft_id !== preview.draftId
      || text(payload.source_version) !== preview.sourceVersion
      || Number(payload.draft_revision) !== preview.revision
      || payload.preview_id !== preview.assembly.previewId) {
    throw new Error('The temporary assembly scene does not match the active draft revision.');
  }
  return adaptModelScene(payload, preview.projectId);
}
