import React from 'react';

export default function LolaFlowQualityNotice({ quality }) {
  if (!quality?.conflicted_entity_count) return null;
  const excluded = quality.policy === 'exclude_entities';
  return <section className="lola-flow-quality" aria-label="Flow data review">
    <strong>{excluded ? `Excluded disputed objects: ${quality.excluded_entity_count}` : `Disputed objects: ${quality.conflicted_entity_count}`}</strong>
    <p>{excluded ? 'Valid records only. Each disputed object is omitted for the entire requested time range, not treated as zero.'
      : 'Show valid records will omit each disputed object for the entire requested time range.'} Source data is unchanged.</p>
    <details><summary>{excluded ? 'Review excluded records' : 'Review disputed values'}</summary>
      <ul>{quality.conflicts.map((item, index) => <li key={`${item.run_id}:${item.entity_name}:${index}`}>
        <strong>{item.entity_name}</strong>
        {item.periods.map(period => <div key={`${period.timestamp}:${period.unit}`}>
          {period.timestamp} · {period.unit}
          <ul>{period.observations.map((observation, i) => <li key={i}>{observation.value} · {observation.source_file}</li>)}</ul>
          {period.observations_truncated && <p>Additional observations are not listed.</p>}
        </div>)}
        {item.periods_truncated && <p>Additional disputed periods are not listed.</p>}
      </li>)}</ul>
      {quality.conflicts_truncated && <p>This review list is limited; the count includes all disputed objects.</p>}
    </details>
  </section>;
}
