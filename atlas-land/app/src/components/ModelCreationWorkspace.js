import React from 'react';
import ModelGeographyTabs from './ModelGeographyTabs';
import ModelDistillationWorkflow from './ModelDistillationWorkflow';

// Both routes create a separate model; geography remains a view-only workspace.
// Keep both tabs mounted so switching modes does not discard a reviewed job.
export default function ModelCreationWorkspace({ context, mixed, subsetPreview, onPreviewMap, onInvalidatePreview, initialMixed = false, request }) {
  return <ModelGeographyTabs label="Model creation methods" idPrefix="model-creation"
    initialTab={initialMixed ? 'mixed' : 'network'} networkLabel="Country & carrier subset"
    network={<ModelDistillationWorkflow context={context} request={request} onPreviewMap={onPreviewMap}
      onInvalidatePreview={onInvalidatePreview} mapPreview={subsetPreview} />}
    mixed={mixed} />;
}
