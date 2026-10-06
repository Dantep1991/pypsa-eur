import React from 'react';
import '@testing-library/jest-dom';
import {act,render,waitFor,screen} from '@testing-library/react';
import {createWorkspaceRegistry} from '../agentWorkspace/registry';
import {WorkspaceAgentProvider} from '../agentWorkspace/react';
import ModelDistillationWorkflow from './ModelDistillationWorkflow';
import ModelMixedModelCreation from './ModelMixedModelCreation';
let registry;
beforeEach(()=>{localStorage.clear();registry=createWorkspaceRegistry();registry.bind('P:v1',{});});
const execute=async(id,action,values={})=>{
  let done=false,failure,reply;
  act(()=>{registry.controllers.get(id).execute(action,values).then(value=>{reply=value;done=true;},error=>{failure=error;done=true;});});
  for(let i=0;!done&&i<120;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
  if(failure)throw failure;if(!done)throw new Error('Preview controller did not settle.');return reply;
};
const mount=element=>render(<WorkspaceAgentProvider value={registry}>{element}</WorkspaceAgentProvider>);
const options={countries:[{id:'ES',label:'Spain'}],carriers:[{id:'electricity',label:'Electricity'}],parent_runs:[]};
test('subset preview starts its existing job and map preview, without claiming a background check is complete',async()=>{
  const request=jest.fn(async(_,action)=>action.startsWith('options')?options:
    {job_id:'job',state:'preparing',phase:'Validating',completed_steps:1,total_steps:6});
  const onPreviewMap=jest.fn();
  mount(<ModelDistillationWorkflow context={{projectId:'P',version:'v1'}} request={request} onPreviewMap={onPreviewMap}/>);
  await waitFor(()=>expect(registry.controllers.get('create')?.ready).toBe(true));
  const reply=await execute('create','preview',{countries:['ES'],boundaryPolicy:'closed'});
  expect(reply).toMatch(/Preparing subset/);expect(reply).not.toMatch(/ready/);
  expect(onPreviewMap).toHaveBeenCalledWith({countries:['ES'],carriers:[],boundaryPolicy:'closed'});
  expect(registry.controllers.get('create').state.job.state).toBe('preparing');
  await expect(execute('create','configure',{countries:[]})).rejects.toThrow('preview is running');
  expect(request.mock.calls.some(([,action])=>action.endsWith('/create'))).toBe(false);
});
test('a failed subset preview reports its real boundary failure, not success',async()=>{
  const request=jest.fn(async(_,action)=>action.startsWith('options')?options:
    {job_id:'failed',state:'failed',phase:'Failed',error:'Boundary data missing'});
  mount(<ModelDistillationWorkflow context={{projectId:'P',version:'v1'}} request={request}/>);
  await waitFor(()=>expect(registry.controllers.get('create')?.ready).toBe(true));
  await expect(execute('create','preview',{countries:['ES'],boundaryPolicy:'closed'})).rejects.toThrow('Boundary data missing');
  expect(screen.getByText('Boundary data missing')).toBeInTheDocument();
});
test('mixed schema preview starts asynchronously and retains publication confirmation',async()=>{
  const request=jest.fn(async()=>({job_id:'mixed',state:'preparing',phase:'Reading properties'}));
  mount(<ModelMixedModelCreation context={{projectId:'P',version:'v1'}} current profile={{focusCountry:'ES',resolutions:['native','country','country']}} request={request}/>);
  expect(await execute('mixed_schema','preview',{name:'Reviewed mix'})).toMatch(/Preparing mixed-model/);
  expect(registry.controllers.get('mixed_schema').actions.create.confirmation).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});
test('an unchanged running mixed preview cannot launch a second job',async()=>{
  const request=jest.fn(async()=>({job_id:'mixed',state:'preparing',phase:'Reading properties'}));
  mount(<ModelMixedModelCreation context={{projectId:'P',version:'v1'}} current profile={{focusCountry:'ES',resolutions:['native','country','country']}} request={request}/>);
  await execute('mixed_schema','preview');
  expect(await execute('mixed_schema','preview')).toMatch(/running/);expect(request).toHaveBeenCalledTimes(1);
});
