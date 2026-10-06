import { atlasCommandReply } from './atlasCommandReply';

test('uses only the verified outcome, without execution and audit narration', () => {
  expect(atlasCommandReply({ judge: { verdict: 'pass', summary: 'Nodes hidden.' } })).toBe('Nodes hidden.');
});
test('locally checked controls have a short confirmation, not a list of unavailable checks', () => {
  expect(atlasCommandReply({ judge: { verdict: 'local_pass', summary: 'Independent AI verification was unavailable.' } }))
    .toBe('Map controls updated.');
});
test('essential blockers retain their complete detail and are not replaced by success', () => {
  const error = 'Choose a parent solution with complete hourly cross-border data before creating this model.';
  expect(atlasCommandReply({ error, judge: { verdict: 'pass', summary: 'Updated.' } })).toBe(error);
});
test('unverified changes are not announced as done', () => {
  expect(atlasCommandReply()).toBe('Unable to verify the update.');
  expect(atlasCommandReply({ judge: { verdict: 'unverified', summary: 'Long verifier diagnostics.' } }))
    .toBe('Unable to verify the update.');
});
test('preserves necessary correction and unsupported-operation explanations', () => {
  expect(atlasCommandReply({ judge: { verdict: 'repair', summary: 'Select a line first.' } })).toBe('Select a line first.');
  expect(atlasCommandReply({ judge: { verdict: 'pass', summary: 'This model has no solved results.' } }))
    .toBe('This model has no solved results.');
});
test('empty verified summaries have a concise fallback', () => {
  expect(atlasCommandReply({ judge: { verdict: 'pass', summary: '   ' } })).toBe('Updated.');
});

test('a verified read preserves the requested answer rather than a generic audit summary', () => {
  const answer = 'Saved region runs:\n1. region_saved_france-paris-100km';
  expect(atlasCommandReply({ judge: { verdict: 'pass', summary: 'Read verified.' }, answer })).toBe(answer);
  expect(atlasCommandReply({ judge: { verdict: 'unverified' }, answer })).toBe('Unable to verify the update.');
});
