import { atlasApiUrl } from '../config/api';

const choices = ['increase', 'decrease', 'context_dependent'];
const neutral = () => ({ preference: 'context_dependent', manual_required: true,
  reason: 'AI colour recommendation unavailable. Values are shown with neutral colours.' });

// Reuse Compare's bounded Jev advisory and backend property cache. No quantity
// names or signs decide meaning here; magnitude and source values are unchanged.
export async function interpretResultColours(scene, options = {}, fetchImpl = window.fetch.bind(window)) {
  if (!scene || scene.comparison || scene.selection?.map_mode === 'mix') return scene;
  const selection = scene.selection || {};
  options.onProgress?.({ phase: 'interpretation', completed: 0, total: 1 });
  let policy;
  try {
    const response = await fetchImpl(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(scene.project_id)}/comparison-policy`, options.apiBase), {
      method: 'POST', signal: options.signal, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_version: scene.model_version, class_name: selection.class_name,
        property_name: selection.property_name, unit: scene.legend?.unit || '',
        category: selection.category || '', objective: options.objective || '' }),
    });
    if (!response.ok) throw new Error('Decision unavailable');
    policy = await response.json();
    if (!choices.includes(policy?.preference)) throw new Error('Invalid colour preference');
  } catch (error) {
    if (options.signal?.aborted || error?.name === 'AbortError') throw error;
    policy = neutral();
  }
  if (options.signal?.aborted) throw new DOMException('Result colouring cancelled', 'AbortError');
  options.onProgress?.({ phase: 'interpretation', completed: 1, total: 1 });
  return { ...scene, color_policy: policy,
    legend: { ...scene.legend, favourable_direction: policy.preference } };
}
