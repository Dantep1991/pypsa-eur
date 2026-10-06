import { enumField, textField } from './registry';

export function inputWorkspace({ inventory, scene, className, category, property, inputDate, inputScenario,
  input, equationMode, expression, status, error, activeModel }) {
  return {
    ready: Boolean(scene && !status), error: !inventory ? error : '',
    fields: {
      className: enumField('Object class', (inventory?.classes || []).filter(row => row.total).map(row => ({ value: row.class_name, label: row.class_name }))),
      category: enumField('Model category', ['', ...new Set((scene?.objects || []).map(row => row.category).filter(Boolean))]),
      property: enumField('Input property', [...new Set((scene?.objects || []).flatMap(row => row.properties || []))].sort()),
      inputScenario: enumField('Input scenario', [{ value: '', label: 'Base inputs' },
        ...(activeModel ? [{ value: '@model', label: 'Active model scenarios' }] : []), ...(input.context?.available_scenarios || [])]),
      inputDate: textField('Input date, YYYY-MM-DDTHH:mm', 32),
      inputYear: enumField('Input year', [...new Set([...(input.context?.available_years || []).map(String), inputDate.slice(0, 4)].filter(Boolean))]),
      expression: textField('Map-view equation using [exact properties], + - * / brackets and percent(…). Does not change model inputs.', 2000),
    },
    actions: { show: { description: 'Configure inputs or an equation and automatically map the values.' },
      configure: { description: 'Configure a prerequisite class or category before selecting its properties; continue=true loads its catalogue.' },
      reload: { description: 'Reload the selected input properties.' }, cancel: { description: 'Cancel the input read.' } },
    state: { className, category, property, inputDate, inputYear: inputDate.slice(0, 4), inputScenario, equationMode, expression,
      loading: Boolean(status || input.busy), cancelled: Boolean(input.cancelled), error: error || input.error,
      resolved: [...input.values.values()].filter(row => Number.isFinite(row.value)).length },
  };
}
