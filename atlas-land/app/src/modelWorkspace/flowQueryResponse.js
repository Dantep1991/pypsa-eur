// Expand the lossless wire representation before the existing result validators.
export function unpackFlowResponse(payload) {
  if (!payload.response_format) return payload;
  if (payload.response_format !== 'nohm.flow-series.v1' || !Array.isArray(payload.periods) || !Array.isArray(payload.series)) throw new Error('Invalid compact flow response.');
  const rows=[], timestamps=new Map(payload.periods.map(period=>[period,Date.parse(period)]));
  if ([...timestamps.values()].some(value=>!Number.isFinite(value))) throw new Error('Invalid compact flow timestamp.');
  for (const series of payload.series) {
    if (!series.metadata || !Array.isArray(series.indexes) || !Array.isArray(series.values) || series.indexes.length !== series.values.length) throw new Error('Incomplete compact flow series.');
    series.indexes.forEach((index, at) => {
      if (!Number.isInteger(index) || index < 0 || index >= payload.periods.length || !Number.isFinite(series.values[at])) throw new Error('Invalid compact flow observation.');
      const value = series.values[at], metadata=series.metadata;
      rows.push({...metadata,time_bucket:payload.periods[index],value,abs_value:Math.abs(value),
        actual_from_node:value>=0?metadata.from_node:metadata.to_node,actual_to_node:value>=0?metadata.to_node:metadata.from_node});
    });
  }
  if (rows.length !== payload.summary?.row_count) throw new Error('Compact flow row count does not match its receipt.');
  // Parse each distinct timestamp once, not twice on every comparison across
  // millions of flow/limit rows in a full-year view.
  rows.sort((a,b)=>timestamps.get(a.time_bucket)-timestamps.get(b.time_bucket));
  return {...payload,rows};
}
