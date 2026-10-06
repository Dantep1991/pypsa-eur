// Only exact canonical objects can seed an agent operation. Visual clusters
// and result aggregates are not mutable source objects.
export function modelSelectionPointer(selection, context) {
  const record = selection?.record;
  if (!record || record.source_model_project !== context?.projectId
      || record.source_model_version !== context?.version
      || record.atlas_region_group_name || record.source_edge_ids?.length > 1
      || record.atlas_source_ids?.length > 1) return null;
  const className = record.component_type;
  const objectName = record.name;
  if (!className || !objectName || record.id !== `${className}:${objectName}`) return null;
  return { className, objectName, objectId: record.id, category: record.category || '' };
}

export function announceModelSelection(selection, askAgent = false, targetWindow = window) {
  const context = targetWindow?.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  if (context?.mode !== 'model' || !targetWindow.parent || targetWindow.parent === targetWindow) return false;
  const pointer = modelSelectionPointer(selection, context);
  if (askAgent && !pointer) return false;
  targetWindow.parent.postMessage({ type: 'nohm.atlas.selection.v1', protocolVersion: 1,
    source: 'nohm-atlas', projectId: context.projectId, modelVersion: context.version,
    modelName: context.modelName || null, selection: pointer, askAgent }, targetWindow.location.origin);
  return true;
}
