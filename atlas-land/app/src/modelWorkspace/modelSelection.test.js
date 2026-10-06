import { modelSelectionPointer, announceModelSelection } from './modelSelection';
const context = { mode: 'model', projectId: 'Fixture', version: 'v1', modelName: 'Base' };
const selection = { kind: 'link', record: { id: 'Line:A-B', name: 'A-B', component_type: 'Line', category: 'Network', source_model_project: 'Fixture', source_model_version: 'v1' } };
test('only exact pinned canonical objects can seed mutation context', () => {
  expect(modelSelectionPointer(selection, context)).toEqual({ className: 'Line', objectName: 'A-B', objectId: 'Line:A-B', category: 'Network' });
  expect(modelSelectionPointer(selection, { ...context, version: 'v2' })).toBeNull();
  expect(modelSelectionPointer({ ...selection, record: { ...selection.record, source_edge_ids: ['Line:A-B', 'Line:C-D'] } }, context)).toBeNull();
});
test('publishes only identities to the same-origin parent; no source values or mutation command', () => {
  const parent = { postMessage: jest.fn() };
  const host = { parent, location: { origin: 'http://localhost:5176' }, __NOHM_ATLAS_WORKSPACE_CONTEXT__: context };
  expect(announceModelSelection(selection, true, host)).toBe(true);
  expect(parent.postMessage.mock.calls[0][0]).toMatchObject({ type: 'nohm.atlas.selection.v1', modelName: 'Base', askAgent: true });
  expect(parent.postMessage.mock.calls[0][1]).toBe(host.location.origin);
  expect(announceModelSelection(null, true, host)).toBe(false);
  expect(announceModelSelection(null, false, host)).toBe(true);
});
