import React from 'react';
import { PanelLeftOpen } from 'lucide-react';
import ModelWorkspaceSection from './ModelWorkspaceSection';
import ModelPortalControls from './ModelPortalControls';
import ModelRunStatus from './ModelRunStatus';

export default function ModelProjectTools({ embedded, onOpen, runState }) {
  return <ModelWorkspaceSection title="Model & project tools" Icon={PanelLeftOpen}>
    <ModelPortalControls embedded={embedded} onOpen={onOpen}
      targets={['explore-model', 'model-runs', 'demand', 'climate', 'commodity', 'synapse-network', 'visualisation']} />
    {runState?.latest && <ModelRunStatus runState={runState} hideAction />}
  </ModelWorkspaceSection>;
}
