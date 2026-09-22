import { builderAssemblySceneRequestUrl, fetchBuilderAssemblyScene } from './builderAssemblyScene';


const preview = {
  projectId: 'TYNDP_2026', draftId: 'atlas-v3', sourceVersion: 'v3.0.0', revision: 8,
  mode: 'assembled-summary', geometryStatus: 'resolved-preview',
  assembly: { previewId: 'a'.repeat(32), sceneAvailable: true },
};

test('builds an exact draft-revision assembly scene URL', () => {
  expect(builderAssemblySceneRequestUrl(preview)).toBe(
    `/api/atlas/projects/TYNDP_2026/builder-drafts/atlas-v3/assembly/${'a'.repeat(32)}/scene?source_version=v3.0.0&draft_revision=8`,
  );
  expect(builderAssemblySceneRequestUrl({ ...preview, revision: 9, geometryStatus: 'assembled-no-geometry' })).toBeNull();
});

test('rejects a scene returned for another draft revision', async () => {
  const payload = {
    schema: 'nohm.atlas.model-scene.v1', temporary: true,
    project_id: 'TYNDP_2026', draft_id: 'atlas-v3', source_version: 'v3.0.0', draft_revision: 7,
    preview_id: 'a'.repeat(32), version: `draft:${'a'.repeat(32)}`, carrier: 'electricity', layers: ['grid'],
    nodes: [], links: [], assets: [], coverage: { counts: { nodes: 0, mapped_nodes: 0, links: 0, assets: 0 } },
  };
  await expect(fetchBuilderAssemblyScene(preview, {}, async () => ({
    ok: true, status: 200, json: async () => payload,
  }))).rejects.toThrow(/does not match/i);
});
