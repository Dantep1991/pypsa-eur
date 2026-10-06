// A deliberately small, non-executing grammar for read-only map calculations.
// Property semantics remain in the schema resolver, not in this evaluator.
const fail = message => { throw new Error(message); };
const scalar = (value, units = new Map(), constant = false) => ({ value, units, constant });
const finite = value => Number.isFinite(value) ? value : fail('The equation produced a non-finite value.');
const sameUnits = (a, b) => a.size === b.size && [...a].every(([unit, power]) => b.get(unit) === power);
const combineUnits = (a, b, sign) => {
  const next = new Map(a);
  b.forEach((power, unit) => {
    const result = (next.get(unit) || 0) + sign * power;
    if (result) next.set(unit, result); else next.delete(unit);
  });
  return next;
};
const displayUnit = units => [...units].sort(([a], [b]) => a.localeCompare(b))
  .map(([unit, power]) => power === 1 ? unit : `${unit}^${power}`).join(' · ');

export const inputPropertyToken = property => `[${property}]`;

export function parseInputEquation(expression, availableProperties) {
  if (!expression.trim()) fail('Enter an equation.');
  if (expression.length > 2000) fail('Keep the equation under 2,000 characters.');
  const tokens = [];
  const pattern = /\s+|\[([^\[\]]+)\]|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z_]+|[()+\-*/%]/igy;
  let offset = 0;
  while (offset < expression.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(expression);
    if (!match) fail(`Unexpected character at position ${offset + 1}.`);
    offset = pattern.lastIndex;
    if (!match[0].trim()) continue;
    tokens.push(match[1] !== undefined ? { type: 'property', value: match[1] } : { type: match[0], value: match[0] });
    if (tokens.length > 256) fail('The equation is too complex.');
  }
  const properties = new Set(), available = new Set(availableProperties);
  let index = 0, depth = 0;
  const peek = () => tokens[index]?.type;
  const take = type => { if (peek() !== type) fail(`Expected ${type}.`); return tokens[index++]; };
  function primary() {
    if (++depth > 32) fail('Too many nested brackets.');
    let node;
    if (peek() === 'property') {
      const name = take('property').value;
      if (!available.has(name)) fail(`Unknown input property: ${name}.`);
      properties.add(name); node = { type: 'property', name };
    } else if (peek() === '(') {
      take('('); node = sum(); take(')');
    } else if (peek() === 'total' || peek() === 'percent') {
      const type = tokens[index++].type; take('('); node = { type, argument: sum() }; take(')');
    } else if (tokens[index] && Number.isFinite(Number(tokens[index].value))) {
      node = { type: 'number', value: Number(tokens[index++].value) };
    } else fail('Use numbers, [input properties], brackets, total(…) or percent(…).');
    while (peek() === '%') { take('%'); node = { type: '/', left: node, right: { type: 'number', value: 100 } }; }
    depth--; return node;
  }
  function unary() {
    if (peek() === '+' || peek() === '-') {
      if (++depth > 32) fail('Too many nested operators.');
      const type = tokens[index++].type, argument = unary(); depth--;
      return { type: 'unary', sign: type === '-' ? -1 : 1, argument };
    }
    return primary();
  }
  function product() {
    let node = unary();
    while (peek() === '*' || peek() === '/') node = { type: tokens[index++].type, left: node, right: unary() };
    return node;
  }
  function sum() {
    let node = product();
    while (peek() === '+' || peek() === '-') node = { type: tokens[index++].type, left: node, right: product() };
    return node;
  }
  const ast = sum();
  if (index !== tokens.length) fail('An operator is missing between values.');
  return { ast, properties: [...properties], expression };
}

export function evaluateInputEquation(plan, objects, propertyValues) {
  const totals = new Map();
  function evaluate(node, id, inTotal = false) {
    if (node.type === 'number') return scalar(node.value, new Map(), true);
    if (node.type === 'property') {
      const measurement = propertyValues.get(node.name)?.get(id);
      if (!Number.isFinite(measurement?.value)) fail(`${node.name}: ${measurement?.note || 'Input not resolved.'}`);
      const unit = measurement.unit?.trim();
      return scalar(measurement.value, unit && unit !== '-' ? new Map([[unit, 1]]) : new Map());
    }
    if (node.type === 'unary') { const result = evaluate(node.argument, id, inTotal); return { ...result, value: finite(node.sign * result.value) }; }
    if (node.type === 'total' || node.type === 'percent') {
      if (inTotal) fail('Totals cannot contain another total or percent-of-total calculation.');
      if (!totals.has(node)) {
        try {
          let result;
          for (const obj of objects) {
            const next = evaluate(node.argument, obj.id, true);
            if (result && !sameUnits(result.units, next.units)) fail('The selected total has incompatible units.');
            result = scalar(finite((result?.value || 0) + next.value), next.units);
          }
          totals.set(node, { result: result || scalar(0) });
        } catch (error) { totals.set(node, { error: new Error(`Total unavailable: ${error.message}`) }); }
      }
      const total = totals.get(node);
      if (total.error) throw total.error;
      if (node.type === 'total') return total.result;
      if (!total.result.value) fail('Percent of total is undefined because the total is zero.');
      const item = evaluate(node.argument, id);
      return scalar(finite(100 * item.value / total.result.value), new Map([['%', 1]]));
    }
    const left = evaluate(node.left, id, inTotal), right = evaluate(node.right, id, inTotal);
    if (node.type === '+' || node.type === '-') {
      // A numeric offset is in the property's units. Two measured quantities
      // must have the same units; MW and GW are not silently interchanged.
      if (!sameUnits(left.units, right.units) && !(left.constant && !left.units.size) && !(right.constant && !right.units.size)) fail('Addition and subtraction require matching units.');
      return scalar(finite(left.value + (node.type === '+' ? right.value : -right.value)), left.units.size ? left.units : right.units, left.constant && right.constant);
    }
    if (node.type === '/') {
      if (!right.value) fail('Division by zero.');
      return scalar(finite(left.value / right.value), combineUnits(left.units, right.units, -1), left.constant && right.constant);
    }
    return scalar(finite(left.value * right.value), combineUnits(left.units, right.units, 1), left.constant && right.constant);
  }
  return new Map(objects.map(obj => {
    const operands = plan.properties.map(property => ({ property, ...propertyValues.get(property)?.get(obj.id) }));
    try {
      const result = evaluate(plan.ast, obj.id);
      return [obj.id, { value: result.value, unit: displayUnit(result.units), status: 'resolved',
        note: '', equation: plan.expression, operands }];
    } catch (error) { return [obj.id, { value: null, unit: '', status: 'unresolved', note: error.message, equation: plan.expression, operands }]; }
  }));
}
