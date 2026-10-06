import { useEffect } from 'react';
import { previewMatchesScene, projectScenarioPreview, mappedPreviewCount, SCENARIO_PREVIEW_ACK, SCENARIO_PREVIEW_MESSAGE } from '../modelWorkspace/scenarioPreview';

export default function useScenarioPreviewBridge({ context, sceneRef, previewRef, publish, resetAggregation, onPreviewChange }) {
  useEffect(() => {
    const receive = event => {
      const data = event.data;
      if (event.source !== window.parent || window.parent === window || event.origin !== window.location.origin
          || data?.source !== 'nohm-host' || data.type !== SCENARIO_PREVIEW_MESSAGE || data.protocolVersion !== 1
          || data.projectId !== context?.projectId || data.version !== context?.version || data.modelName !== (context?.modelName || '')) return;
      const scene = sceneRef.current;
      if (data.report === null) {
        if (previewRef.current && scene) { previewRef.current = null; publish(scene); onPreviewChange(null); }
        return;
      }
      let error = '';
      if (!previewMatchesScene(data.report, scene)) error = 'The loaded geography does not match this scenario preview.';
      else {
        previewRef.current = data.report;
        onPreviewChange({ inputDate: data.report.input_date });
        resetAggregation(); publish(scene);
      }
      window.parent.postMessage({ type: SCENARIO_PREVIEW_ACK, source: 'nohm-atlas', protocolVersion: 1,
        requestId: data.requestId, previewId: data.report?.preview_id, ok: !error, error,
        mapped: error ? 0 : mappedPreviewCount(scene, data.report),
        addedConnections: error ? 0 : projectScenarioPreview(scene, data.report).connections.length - scene.connections.length }, event.origin);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [context?.projectId, context?.version, context?.modelName, sceneRef, previewRef, publish, resetAggregation, onPreviewChange]);
}
