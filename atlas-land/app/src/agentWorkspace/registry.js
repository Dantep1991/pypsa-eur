// The planner receives the same live controls and options the user receives.
// This module validates structured actions; it never interprets user language.
export const WORKSPACES = Object.freeze({
  results: { title: 'Results', area: 'filters', description: 'Display reported model results: run, component, quantity, one or multiple categories, period, node/region, style and circle size. This is NOT an analysis handoff.' },
  inputs: { title: 'Model database', area: 'geography', description: 'View model input properties or mathematical equations, filtered by class, category, scenario and date. Never edit source model inputs.' },
  compare: { title: 'Compare', area: 'filters', description: 'Compare two numerical result solutions on the map, including quantity, category, period, style and favourable direction. Not a visual scene baseline.' },
  flow: { title: 'Grid Flow Analysis', area: 'filters', description: 'Load connection flows, history, temporal aggregation, animation and near-capacity analysis.' },
  flow_capacity: { title: 'Grid Flow Analysis', area: 'filters', tab: 'capacity', prerequisite: 'flow', description: 'Calculate full-year hours near capacity, cancel the calculation, and colour the map using its evidence and threshold. Load the requested flows first.' },
  flow_history: { title: 'Grid Flow Analysis', area: 'filters', tab: 'time', prerequisite: 'flow', description: 'Aggregate the selected connection history by hour/day/week/month/year, collapse, cancel or retry history. Load flows and select the connection first.' },
  flow_chart: { title: 'Grid Flow Analysis', area: 'filters', tab: 'time', prerequisite: 'flow_history', description: 'Inspect, zoom and position the selected connection history; show its inspected source period on the map.' },
  cba: { title: 'Cost-benefit analysis', area: 'filters', description: 'View an existing assessed Theo CBA project: country values or connection congestion rents.' },
  geography: { title: 'Geography Domain', area: 'geography', description: 'Network geography, country scope and mixed-resolution focus/neighbour/rest tiers and regional groups.' },
  country_scope: { title: 'Geography Domain', area: 'geography', prerequisite: 'geography', description: 'Select/add/remove project countries, optionally at a declared country-specific granularity. Preserve other countries and their resolutions.' },
  mixed_view: { title: 'Geography Domain', area: 'geography', description: 'Configure and apply mixed resolution: focus country, number of levels, each tier granularity and regional group scheme.' },
  create: { title: 'Create model', area: 'geography', description: 'Configure and preview a country/carrier subset. Publication requires reviewing the preview and confirmation.' },
  mixed_model: { title: 'Create model', area: 'geography', description: 'Configure a mixed-resolution view and preview a new aggregated model. Publication requires confirmation.' },
  mixed_schema: { title: 'Create model', area: 'geography', tab: 'mixed', prerequisite: 'mixed_model', description: 'Preview and validate the aggregated mixed-resolution model schema after configuring its geography. Publication requires confirmation.' },
  subset_execution: { title: 'Create model', area: 'geography', tab: 'network', prerequisite: 'create', description: 'Run or inspect repairs for the published country/carrier subset, using PLEXOS or the PyPSA conversion agent. The exact child model is bound here. Actual runs and applying repairs require user confirmation.' },
  mixed_execution: { title: 'Create model', area: 'geography', tab: 'mixed', prerequisite: 'mixed_schema', description: 'Run or inspect repairs for the published mixed-resolution model with PLEXOS or PyPSA. Actual runs and applying repairs require user confirmation.' },
  project_tools: { title: 'Model & project tools', area: 'geography', description: 'Open an existing model/project portal: Explore, Run model, Demand profiles, Climate, Commodity, Synapse or Visualisation.' },
  display: { title: 'Map display', area: 'geography', description: 'Map layers, node dots, data bubbles, boundaries, disabled links, pie size, Land, Access and reset.' },
});

export const options = values => values.map(value => typeof value === 'object' ? value : { value, label: String(value) });
export const enumField = (label, values) => ({ type: 'enum', label, options: options(values) });
export const numberField = (label, min, max) => ({ type: 'number', label, min, max });
export const textField = (label, maxLength = 500) => ({ type: 'text', label, maxLength });
export const boolField = label => ({ type: 'boolean', label });

export function validateFields(fields, supplied = {}) {
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Invalid control parameters.');
  const result = {};
  for (const [name, value] of Object.entries(supplied)) {
    const field = fields?.[name];
    if (!field) throw new Error(`Unknown control: ${name}.`);
    if (field.type === 'enum' || field.type === 'list') {
      const allowed = new Set((field.options || []).filter(item => item.enabled !== false).map(item => item.value));
      const selected = field.type === 'list' ? value : [value];
      if (!Array.isArray(selected) || selected.some(item => !allowed.has(item))) throw new Error(`Choose an available ${field.label || name}.`);
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`Invalid ${name}.`);
    } else if (field.type === 'number') {
      if (!Number.isFinite(value) || value < field.min || value > field.max || (field.integer && !Number.isInteger(value))) throw new Error(`Invalid ${name}.`);
    } else if (field.type === 'text') {
      if (typeof value !== 'string' || value.length > (field.maxLength || 500)) throw new Error(`Invalid ${name}.`);
    } else throw new Error(`Unsupported control: ${name}.`);
    result[name] = value;
  }
  return result;
}

export function createWorkspaceRegistry() {
  const controllers = new Map(), launchers = new Map(), tabs = new Map();
  let binding = '', manifest = {};
  const register = (id, controller) => {
    if (controller.catalog) {
      const loaded = (controller.catalog.runs || []).map(row => ({ value: row.run_id, label: row.label }));
      const pending = controller.catalog.pending_runs || [];
      controller = { ...controller, fields: { ...controller.fields,
        catalogRunIds: { ...enumField('Result runs whose own catalogue must finish reading',
          [...loaded, ...pending.map(row => ({ value: row.run_id, label: row.label }))]), type: 'list' } },
        actions: { ...controller.actions, await_catalog: { description: 'Wait for specific pending run inventories, then continue=true to obtain their real controls. Do not substitute another run.' } },
        state: { ...controller.state, pendingRuns: pending } };
    }
    controllers.set(id, controller);
    return () => { if (controllers.get(id) === controller) controllers.delete(id); };
  };
  const delay = () => new Promise(resolve => setTimeout(resolve, 50));
  const wait = async (id, predicate = item => item?.ready, milliseconds = 20000) => {
    const expected = binding, deadline = Date.now() + milliseconds;
    await delay(); // React must commit setters and loading effects first.
    while (Date.now() < deadline) {
      if (binding !== expected) throw new Error('The selected model changed. Please ask again.');
      const item = controllers.get(id);
      if (item?.error) throw new Error(item.error);
      if (predicate(item)) return item;
      await delay();
    }
    throw new Error(`${WORKSPACES[id]?.title || id} is still loading. Please retry.`);
  };
  return {
    register, controllers, launchers, tabs, wait,
    async waitForModel(projectId, milliseconds = 45000) {
      const prefix = `${projectId}:`, deadline = Date.now() + milliseconds;
      while (Date.now() < deadline) {
        if (!binding.startsWith(prefix)) throw new Error('The selected project changed. Please ask again.');
        if (manifest.display?.enabled) return;
        if (manifest.display?.error) throw new Error(manifest.display.error);
        await delay();
      }
      throw new Error('The selected model is still loading. Please retry.');
    },
    bind(next, availability) { if (next !== binding) { controllers.clear(); binding = next; } manifest = availability; },
    snapshot() {
      return { binding, workspaces: Object.fromEntries(Object.entries(WORKSPACES).map(([id, definition]) => {
        const entry = controllers.get(id), availability = manifest[id] || {};
        return [id, { ...definition, ...availability, ready: Boolean(entry?.ready),
          ...(entry ? { fields: entry.fields, actions: entry.actions, state: entry.state, error: entry.error || '' } : {}) }];
      })) };
    },
    async open(id, navigate, recovery = false) {
      if (!WORKSPACES[id]) throw new Error('Unknown Atlas workspace.');
      const available = manifest[id];
      if (available?.enabled === false) throw new Error(available.reason || 'This tool is unavailable for the selected model.');
      navigate(WORKSPACES[id].area);
      const expected = binding, deadline = Date.now() + 5000;
      while (!launchers.get(WORKSPACES[id].title) && Date.now() < deadline && binding === expected) await delay();
      const launcher = launchers.get(WORKSPACES[id].title);
      if (!launcher || binding !== expected) throw new Error('The requested workspace is not ready.');
      launcher();
      await delay();
      const tab = WORKSPACES[id].tab || (['mixed_view', 'mixed_model'].includes(id) ? 'mixed' : id === 'flow' ? null : 'network');
      if (tab) tabs.get(WORKSPACES[id].title)?.(tab);
      if (recovery) {
        const deadline = Date.now() + 5000;
        while (!controllers.get(id) && Date.now() < deadline && binding === expected) await delay();
        if (binding !== expected || !controllers.get(id)) throw new Error('The requested controls are not ready.');
        return controllers.get(id);
      }
      return wait(id, item => item?.ready, 45000);
    },
    async execute({ workspace, action, values = {}, binding: requestedBinding }, navigate) {
      if (requestedBinding !== binding) throw new Error('The action belongs to a different model version.');
      const entry = await this.open(workspace, navigate, ['cancel', 'clear', 'retry', 'reload', 'refresh_catalog', 'show_valid', 'await_catalog'].includes(action));
      if (action === 'open') return `${WORKSPACES[workspace].title} opened.`;
      const definition = entry.actions?.[action];
      if (!definition) throw new Error('This action is unavailable in the selected workspace.');
      if (definition.confirmation) return definition.confirmationMessage || 'Review the preview and confirm Create in the model creation panel.';
      const validated = validateFields(entry.fields, values);
      if (action === 'await_catalog') {
        if (!validated.catalogRunIds?.length || Object.keys(validated).length !== 1) throw new Error('Choose the result run inventories to await.');
        await wait(workspace, item => validated.catalogRunIds.every(runId => item?.catalog?.runs.some(run => run.run_id === runId)), 45000);
        return 'Requested result catalogues loaded.';
      }
      if (validated.catalogRunIds) throw new Error('Catalogue run selection is only valid for await_catalog.');
      const reply = await entry.execute(action, validated);
      await delay(); // Publish React's result state before the completion judge observes it.
      if (requestedBinding !== binding) throw new Error('The selected model changed. Please ask again.');
      return reply;
    },
  };
}
