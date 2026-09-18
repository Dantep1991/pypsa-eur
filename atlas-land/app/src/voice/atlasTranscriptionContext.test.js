import {
  ATLAS_TRANSCRIPTION_CONTEXT,
  buildAtlasTranscriptionContext,
  normalizeAtlasVoiceTranscript,
} from './atlasTranscriptionContext';

test('keeps the complete Atlas vocabulary in the default transcription context', () => {
  expect(ATLAS_TRANSCRIPTION_CONTEXT.mode).toBe('transcription');
  expect(ATLAS_TRANSCRIPTION_CONTEXT.language).toBe('');
  expect(ATLAS_TRANSCRIPTION_CONTEXT.keywords).toEqual(expect.arrayContaining([
    'France', 'NUTS3', 'bidding zone', 'methane', 'grid access',
  ]));
});

test('promotes the live map context without duplicating vocabulary hints', () => {
  const context = buildAtlasTranscriptionContext({
    countries: ['Spain', 'France'],
    carrier: 'electricity',
    resolution: 'NUTS3',
  });

  expect(context.keywords.slice(0, 4)).toEqual(['Spain', 'France', 'NUTS3', 'electricity']);
  expect(context.keywords.filter((value) => value === 'France')).toHaveLength(1);
  expect(context.prompt).toContain('current map context is: Spain, France, NUTS3, electricity');
  expect(context.prompt).toContain('preserve France rather than friends or fonts');
});

test('ignores empty live hints and returns immutable session data', () => {
  const context = buildAtlasTranscriptionContext({ countries: ['', '  '] });

  expect(context.prompt).not.toContain('current map context is:');
  expect(Object.isFrozen(context)).toBe(true);
  expect(Object.isFrozen(context.keywords)).toBe(true);
});

test.each([
  ['friends', 'France'],
  ['fonts.', 'France.'],
  ['show me friends', 'show me France'],
  ['add fonts to the grid', 'add France to the grid'],
  ['friends at nuts three', 'France at nuts three'],
])('repairs an unambiguous France homophone in Atlas voice command %j', (spoken, expected) => {
  expect(normalizeAtlasVoiceTranscript(spoken)).toBe(expected);
});

test.each([
  'my friends in Spain',
  'change the fonts',
  'show my friends on the map',
])('does not rewrite ordinary conversation %j', (spoken) => {
  expect(normalizeAtlasVoiceTranscript(spoken)).toBe(spoken);
});
