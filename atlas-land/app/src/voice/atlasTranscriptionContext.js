// These are model hints, not parsing rules. The transcription model remains
// responsible for deciding what was spoken; Atlas's planner remains responsible
// for deciding what it means.
const ATLAS_TRANSCRIPTION_KEYWORDS = Object.freeze([
  'Nohm Atlas', 'EMIL', 'PyPSA', 'France', 'Belgium', 'Spain', 'Portugal',
  'Germany', 'Italy', 'Great Britain', 'United Kingdom', 'Ireland', 'Netherlands',
  'Luxembourg', 'Switzerland', 'Austria', 'Czechia', 'Slovakia', 'Poland',
  'Denmark', 'Norway', 'Sweden', 'Finland', 'Estonia', 'Latvia', 'Lithuania',
  'Slovenia', 'Croatia', 'Bosnia and Herzegovina', 'Serbia', 'Montenegro',
  'Kosovo', 'North Macedonia', 'Albania', 'Greece', 'Bulgaria', 'Romania',
  'Hungary', 'Moldova', 'Ukraine', 'Turkey', 'Iberian Peninsula', 'Baltics',
  'Balkans', 'NUTS1', 'NUTS2', 'NUTS3', 'bidding zone', 'e-Highway',
  'full nodal network', 'electricity', 'methane', 'hydrogen', 'water',
  'oil and liquids', 'grid', 'supply', 'generation', 'demand', 'storage',
  'generation mix', 'grid access', 'connection queue', 'Natura 2000',
]);

const cleanHint = (value) => String(value || '').trim();

// Realtime captions are still probabilistic even with keyword hints. Keep this
// deliberately tiny and Atlas-specific: these are observed France homophones,
// and we only repair either a bare utterance or an unambiguous map-command
// construction. Free conversation such as "my friends in Spain" is untouched.
const FRANCE_HOMOPHONE = /\b(?:friends|fonts)\b/gi;
const FRANCE_COMMAND = new RegExp(
  String.raw`^(?:(?:show|load|add|include|remove|hide|isolate|focus|frame|open|display)(?:\s+me)?(?:\s+the)?(?:\s+country)?\s+)?(?:friends|fonts)(?=\s+(?:at|in|on|with|from|to\s+(?:the\s+)?(?:grid|map|network)|grid|network|nuts(?:\s*[123]|\s+(?:one|two|three))|bidding|full|nodal)\b|[\s.!?,]*$)`,
  'i',
);

export const normalizeAtlasVoiceTranscript = (value) => {
  const transcript = String(value || '').trim();
  if (!transcript || !FRANCE_COMMAND.test(transcript)) return transcript;
  return transcript.replace(FRANCE_HOMOPHONE, 'France');
};

export const buildAtlasTranscriptionContext = ({
  countries = [],
  carrier = '',
  resolution = '',
} = {}) => {
  const currentHints = [
    ...countries,
    resolution,
    carrier,
  ].map(cleanHint).filter(Boolean);
  const keywords = [...new Set([...currentHints, ...ATLAS_TRANSCRIPTION_KEYWORDS])];
  const currentContext = currentHints.length
    ? ` The current map context is: ${currentHints.join(', ')}.`
    : '';

  return Object.freeze({
    mode: 'transcription',
    language: '',
    delay: 'medium',
    prompt: (
      'A user is controlling Nohm Atlas, a European energy and infrastructure map, through EMIL. '
      + 'Preserve exact place and country names and energy-system terminology. Commands may change '
      + 'countries, network resolution, map framing, infrastructure layers, filters, or model settings. '
      + 'In a map command, transcribe a spoken country name as the country rather than a similar common word; '
      + 'for example, preserve France rather than friends or fonts.'
      + currentContext
    ),
    keywords: Object.freeze(keywords),
  });
};

export const ATLAS_TRANSCRIPTION_CONTEXT = buildAtlasTranscriptionContext();
