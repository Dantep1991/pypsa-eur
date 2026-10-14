import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import RegionalClusteringWorkspace from './RegionalClusteringWorkspace';
import {busKey} from '../manualNetworkClusters';
const bus={id:'a',component_type:'bus',sourceCountryCode:'BE',sourceNetworkFilename:'native.nc',longitude:1,latitude:50};
const result={schema:'nohm.atlas.manual-clusters.v1',groups:[{id:'growth-1',name:'Seed region',members:[busKey(bus)],countryCodes:['BE'],longitude:1,latitude:50,
  seedRegionId:'BE001',regionIds:['BE001','BE002'],regionCount:2}],sources:[],warnings:[],regionCount:2,regionLevel:'nuts3',level:'growth',assignedCount:1,sourceCount:1};
beforeEach(()=>{global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({state:'complete',result})});});
test('defaults to evidence growth, sends complete settings and applies one aggregate result',async()=>{
  const apply=jest.fn();render(<RegionalClusteringWorkspace countries={['BE']} countryCodes={['BE']} facilities={[bus]} onLoadNative={async()=>({})} onApply={apply}/>);
  expect(screen.getByRole('tab',{name:'Eurostat regions'})).toHaveAttribute('aria-selected','true');
  expect(screen.queryByRole('button',{name:'Build regional clusters'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Growth cluster count'),{target:{value:'1'}});
  fireEvent.click(screen.getByRole('button',{name:'Build Eurostat regions'}));
  await screen.findByText('2 NUTS3 regions → 1 groups · 1/1 buses assigned. Shown on map.');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({level:'growth',clusters:1,regionLevel:'nuts3',
    evidence:{indicators:['density'],weights:{density:1},year:2023,scaling:'zscore',evidenceInfluence:1}});
  expect(apply).toHaveBeenCalledTimes(1);
});
test('legacy typology and geographic clustering are separate tabs and switching clears prior map state',()=>{
  const clear=jest.fn(),overlay=jest.fn();render(<RegionalClusteringWorkspace countries={['BE']} countryCodes={['BE']} onClearAggregation={clear} onOverlayChange={overlay}/>);
  fireEvent.click(screen.getByRole('tab',{name:'Regional typology'}));
  expect(screen.getByRole('button',{name:'Build regional clusters'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Build Eurostat regions'})).not.toBeInTheDocument();
  expect(clear).toHaveBeenCalledTimes(1);expect(overlay).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole('tab',{name:'Geographic regions'}));
  expect(screen.getByRole('button',{name:'Build network grouping'})).toBeInTheDocument();
});
test('changing to NUTS3 drops unavailable labour indicators and respects selected weights',async()=>{
  render(<RegionalClusteringWorkspace countries={['BE']} countryCodes={['BE']} facilities={[bus]} onLoadNative={async()=>({})} onApply={jest.fn()}/>);
  fireEvent.change(screen.getByLabelText('Growth region level'),{target:{value:'nuts2'}});
  fireEvent.click(screen.getByLabelText('Growth Employment rate'));
  fireEvent.change(screen.getByLabelText('Growth Population density weight'),{target:{value:'4'}});
  fireEvent.change(screen.getByLabelText('Growth region level'),{target:{value:'nuts3'}});
  expect(screen.getByLabelText('Growth Employment rate')).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Build Eurostat regions'}));
  await waitFor(()=>expect(fetch).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body).evidence).toMatchObject({indicators:['density'],weights:{density:4}});
});
