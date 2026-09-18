import { buildGridAccessPopupContent } from './gridAccessPopup';

function popup(properties) {
  const root = document.createElement('div');
  root.innerHTML = buildGridAccessPopupContent(properties);
  return root;
}

test('all imported textual fields are literal text', () => {
  const text = '<img src=x onerror="alert(1)">';
  const root = popup({ name: text, side_label: text, region_name: text,
    earliest_target_date: text, location_method: text, source_keys: [text],
    project_samples: [{ name: text, target_connection_date: text, capacity_mw: null }] });
  expect(root.querySelector('img,script,iframe')).toBeNull();
  expect(root.textContent.split(text)).toHaveLength(9);
  expect(root.textContent).not.toContain('Not published MW');
});

test('unknown project capacities and confidence are not zero and malformed optional arrays are safe', () => {
  const root = popup({ location_confidence: null, source_keys: 'not-an-array', project_samples: [null, { name: 'Example', capacity_mw: '' }] });
  expect(root.textContent).toContain('confidence Not published');
  expect(root.textContent).toContain('Example');
  expect(root.textContent).not.toContain('0 MW');
  expect(root.textContent).toContain('Screening evidence, not a connection offer');
});

test('explicit zero confidence/lead-time/pressure is retained and project list is bounded', () => {
  const root = popup({ location_confidence: 0, lead_time_years: 0, pressure_pct: 0,
    earliest_target_date: '2030-01-01', project_samples: Array.from({ length: 100 }, (_, index) => ({ name: `Project ${index}`, capacity_mw: 0 })) });
  expect(root.textContent).toContain('confidence 0%');
  expect(root.textContent).toContain('2030-01-01 · 0 years');
  expect(root.textContent).toContain('Project 2');
  expect(root.textContent).not.toContain('Project 3');
});
