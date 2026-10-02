// PLEXOS summary Flow is forward energy; Flow Back is positive reverse energy.
// Prefer a reported Net Flow. Derivation is only for Line with both quantities,
// never Gas Pipeline inlet minus outlet (which would measure losses, not net flow).
export function withAnnualNetFlow(quantities) {
  const line = quantities.filter(item => item.class_name === 'Line');
  if (line.some(item => item.property_name === 'Net Flow' && item.available_granularities.includes('year'))) return quantities;
  const forward = line.find(item => item.property_name === 'Flow' && item.available_granularities.includes('year'));
  const back = line.find(item => item.property_name === 'Flow Back' && item.available_granularities.includes('year')
    && item.report_family === forward?.report_family);
  const unit = item => item?.units_by_granularity?.year || item?.unit;
  if (!forward || !back || !unit(forward) || unit(forward) !== unit(back)) return quantities;
  return [...quantities, { ...forward, id: 'Line.Annual Net Flow', property_name: 'Net Flow',
    available_granularities: ['year'], unit: unit(forward), units_by_granularity: { year: unit(forward) },
    periods: (forward.periods || []).filter(period => back.periods?.includes(period)), derived_net_flow: true }];
}

export function subtractReverseFlow(forward, back, selection) {
  if (forward.unit !== back.unit) throw new Error('Forward and reverse energy have incompatible units.');
  const reverseById = new Map(back.lines.map(line => [line.id, line]));
  if (forward.lines.length !== back.lines.length) throw new Error('Annual net flow requires both forward and reverse energy for every connection. Missing data is not zero.');
  const lines = forward.lines.map(line => {
    const reverse = reverseById.get(line.id);
    if (!reverse || line.values.size !== reverse.values.size) throw new Error('Annual net flow has incomplete forward/reverse periods.');
    const values = new Map([...line.values].map(([period, value]) => {
      const reverseValue = reverse.values.get(period);
      if (!Number.isFinite(reverseValue) || value < 0 || reverseValue < 0) throw new Error('Annual net flow requires non-negative reported forward and reverse energy in matching periods.');
      return [period, value - reverseValue];
    }));
    return { ...line, values };
  });
  return { ...forward, lines, selection, direction: 1, derivation: 'Reported Flow − Flow Back',
    maximum: lines.filter(line => line.coordinates?.length >= 2).reduce((max, line) =>
      [...line.values.values()].reduce((limit, value) => Math.max(limit, Math.abs(value)), max), 0) };
}
