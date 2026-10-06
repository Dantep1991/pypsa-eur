import { createWorkspaceRegistry, validateFields, enumField, boolField, numberField, textField } from './registry';

const fields = { category: enumField('Category', [{ value: 'available' }, { value: 'disabled', enabled: false }]),
  countries: { ...enumField('Country', ['AA', 'BB']), type: 'list' }, size: numberField('Size', .5, 2), enabled: boolField('Enabled'), expression: textField('Equation', 30) };

test.each([{ category: 'missing' }, { category: 'disabled' }, { countries: 'AA' }, { countries: ['CC'] },
  { size: Infinity }, { size: .1 }, { enabled: 1 }, { expression: 'x'.repeat(31) }, { unknown: 'x' }])('rejects undeclared or disabled control values %j', values => {
  expect(() => validateFields(fields, values)).toThrow();
});
test('preserves partial updates and algebra without evaluating arbitrary code', () => {
  expect(validateFields(fields, { countries: ['AA'], expression: '([Capacity] * 2) / 10' })).toEqual({ countries: ['AA'], expression: '([Capacity] * 2) / 10' });
});

const fixture = () => {
  const registry = createWorkspaceRegistry(); registry.bind('model:v1', { results: { enabled: true }, create: { enabled: true } });
  registry.launchers.set('Results', jest.fn()); registry.launchers.set('Create model', jest.fn());
  const execute = jest.fn(async () => 'Shown.');
  registry.register('results', { ready: true, fields, actions: { show: {}, clear: {} }, execute });
  return { registry, execute, navigate: jest.fn() };
};
test('workspace actions use the exact shared controller and binding', async () => {
  const { registry, execute, navigate } = fixture();
  await expect(registry.execute({ workspace: 'results', action: 'show', values: { category: 'available' }, binding: 'model:v1' }, navigate)).resolves.toBe('Shown.');
  expect(navigate).toHaveBeenCalledWith('filters'); expect(execute).toHaveBeenCalledWith('show', { category: 'available' });
  await expect(registry.execute({ workspace: 'results', action: 'show', binding: 'other:v1' }, navigate)).rejects.toThrow('different model');
});
test('source model creation never bypasses preview approval', async () => {
  const { registry, navigate } = fixture(); const publish = jest.fn();
  registry.register('create', { ready: true, fields: {}, actions: { create: { confirmation: true } }, execute: publish });
  await expect(registry.execute({ workspace: 'create', action: 'create', binding: 'model:v1' }, navigate)).resolves.toMatch(/confirm Create/);
  expect(publish).not.toHaveBeenCalled();
});
test('cancel and clear still work when a query has failed or is loading', async () => {
  const { registry, navigate, execute } = fixture();
  registry.register('results', { ready: false, error: 'Query failed', fields: {}, actions: { clear: {} }, execute });
  await registry.execute({ workspace: 'results', action: 'clear', binding: 'model:v1' }, navigate);
  expect(execute).toHaveBeenCalledWith('clear', {});
});
test('an unavailable tool explains its real reason', async () => {
  const { registry, navigate } = fixture(); registry.bind('model:v1', { cba: { enabled: false, reason: 'Assessment failed.' } });
  await expect(registry.open('cba', navigate)).rejects.toThrow('Assessment failed.');
});
test('a model change invalidates the previous controls and pending query', async () => {
  const { registry } = fixture();
  const pending = registry.wait('results', () => false, 1000);
  registry.bind('model:v2', {});
  await expect(pending).rejects.toThrow('selected model changed');
  expect(registry.controllers.size).toBe(0);
});
test('startup accepts the requested project acquiring its initial exact model binding',async()=>{
  const registry=createWorkspaceRegistry();registry.bind('P:',{display:{enabled:false}});
  const pending=registry.waitForModel('P');
  registry.bind('P:v1',{display:{enabled:true}});
  await expect(pending).resolves.toBeUndefined();
});
test('startup never crosses a project change or ignores a source loading failure',async()=>{
  const registry=createWorkspaceRegistry();registry.bind('P:',{display:{enabled:false}});
  const pending=registry.waitForModel('P');registry.bind('Other:v1',{display:{enabled:true}});
  await expect(pending).rejects.toThrow('project changed');
  registry.bind('P:',{display:{enabled:false,error:'Exact source unavailable'}});
  await expect(registry.waitForModel('P')).rejects.toThrow('Exact source unavailable');
});

test('pending inventories wait for their own run without invoking a display or borrowing quantities',async()=>{
  const {registry,navigate,execute}=fixture();
  const a={run_id:'a',label:'Loaded',quantities:[{id:'Node.Price'}]};
  registry.register('results',{ready:true,catalog:{runs:[a],pending_runs:[{run_id:'b',label:'Requested'}]},fields:{},actions:{show:{}},execute});
  expect(registry.snapshot().workspaces.results.state.pendingRuns[0].run_id).toBe('b');
  const pending=registry.execute({workspace:'results',action:'await_catalog',values:{catalogRunIds:['b']},binding:'model:v1'},navigate);
  await new Promise(resolve=>setTimeout(resolve,120));
  expect(execute).not.toHaveBeenCalled();
  registry.register('results',{ready:true,catalog:{runs:[a,{run_id:'b',quantities:[{id:'Gas Node.Price'}]}]},fields:{},actions:{show:{}},execute});
  await expect(pending).resolves.toBe('Requested result catalogues loaded.');
  await expect(registry.execute({workspace:'results',action:'await_catalog',values:{catalogRunIds:['unknown']},binding:'model:v1'},navigate)).rejects.toThrow('available');
  expect(execute).not.toHaveBeenCalled();
});
