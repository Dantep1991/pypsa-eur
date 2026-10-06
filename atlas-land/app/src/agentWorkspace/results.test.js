import { resolveResultSelection, resultWorkspace } from './results';
const price = { id: 'Node.Price', class_name: 'Node', property_name: 'Price', unit: '$/MWh', categories: ['Electricity', 'H2 Imports'], periods: ['2050'] };
const gas = { id: 'Gas Node.Price', class_name: 'Gas Node', property_name: 'Price', unit: '$/GJ', categories: ['Hydrogen Market', 'Methane Market'], periods: ['2050'] };
const catalog = { runs: [{ run_id: 'run', compatible: true, result_model_version: 'v1', label: 'Saved run', quantities: [price, gas] }] };
const current = { runId: 'run', quantityId: price.id, category: 'Electricity', period: '2050', mapMode: 'bubbles' };
test('hydrogen market display uses the actual Gas Node quantity, not the electricity imports category', () => {
  expect(resolveResultSelection(catalog, current, { quantityId: gas.id, category: 'Hydrogen Market' })).toMatchObject({ className: 'Gas Node', propertyName: 'Price', unit: '$/GJ', category: 'Hydrogen Market' });
});
test('cross-component category mistakes, unbound runs and absent periods are rejected', () => {
  expect(() => resolveResultSelection(catalog, current, { category: 'Hydrogen Market' })).toThrow('category');
  expect(() => resolveResultSelection(catalog, current, { runId: 'missing' })).toThrow('bound');
  expect(() => resolveResultSelection(catalog, current, { period: '2030' })).toThrow('period');
});
test('AI receives the same quantity/category/unit choices as the user', () => {
  expect(resultWorkspace({ state: 'ready', catalog }, current, { state: 'idle' }, [], 1).fields.quantityId.options[1])
    .toMatchObject({ value: gas.id, categories: ['Hydrogen Market', 'Methane Market'], label: 'Gas Node · Price ($/GJ)' });
});

test('AI selects a deduplicated union, can remove a category and restore all', () => {
  const multiPrice = { ...price, category_objects: { Electricity: ['A', 'Shared'], 'H2 Imports': ['B', 'Shared'] } };
  const multiCatalog = { runs: [{ ...catalog.runs[0], quantities: [multiPrice, gas] }] };
  const both = resolveResultSelection(multiCatalog, current, { categories: ['Electricity', 'H2 Imports', 'Electricity'] });
  expect(both).toMatchObject({ category: '', categories: ['Electricity', 'H2 Imports'], categoryObjects: ['A', 'Shared', 'B'] });
  expect(resolveResultSelection(multiCatalog, both, { categories: ['H2 Imports'] })).toMatchObject({ category: 'H2 Imports', categoryObjects: ['B', 'Shared'] });
  expect(resolveResultSelection(multiCatalog, both, { categories: [] })).toMatchObject({ category: '', categories: [], categoryObjects: [] });
  expect(resolveResultSelection(multiCatalog, both, { quantityId: gas.id })).toMatchObject({ categories: [], categoryObjects: [] });
  expect(resultWorkspace({ state: 'ready', catalog: multiCatalog }, both, { state: 'idle' }, [], 1).fields.categories.type).toBe('list');
});

test.each([{ categories: ['Electricity', 'invented'] }, { categories: 'Electricity' },
  { categories: ['Electricity'], category: 'Electricity' }, { categories: ['Hydrogen Market'] }])(
  'invalid multi-category selections are rejected without broadening: %j', values => {
    expect(() => resolveResultSelection(catalog, current, values)).toThrow(/categor/);
  });
test('quantity catalogues stay bound to the selected run; another year requires a run prerequisite',()=>{
  const other={...catalog.runs[0],run_id:'other',periods:['2040'],quantities:[{...price,categories:['Different'],periods:['2040']}]};
  const descriptor=resultWorkspace({state:'ready',catalog:{runs:[catalog.runs[0],other]}},current,{state:'idle'},[],1);
  expect(descriptor.fields.quantityId.options[0].categories).toEqual(price.categories);
  expect(descriptor.fields.period.options.map(row=>row.value)).toEqual(['2050']);
  expect(descriptor.fields.runId.options[1]).toMatchObject({value:'other',periods:['2040'],quantities:['Node.Price']});
});
