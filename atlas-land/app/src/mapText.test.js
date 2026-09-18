import { escapeMapText, formatPublishedNumber, publishedNumber } from './mapText';

test.each([null, undefined, '', '  ', false, true, [], [0], {}, NaN, Infinity, 'NaN', 'Infinity', 'not reported'])(
  'non-measurements remain unknown (%p)', value => {
    expect(publishedNumber(value)).toBeNull();
    expect(formatPublishedNumber(value, 0, 'MW')).toBe('Not published');
  },
);

test.each([0, '0', ' 0 '])('published zero remains a measurement (%p)', value => {
  expect(publishedNumber(value)).toBe(0);
  expect(formatPublishedNumber(value, 1, 'MW')).toBe('0 MW');
});

test('numeric strings and finite decimals preserve their values', () => {
  expect(publishedNumber('12.5')).toBe(12.5);
  expect(publishedNumber('-1.5')).toBe(-1.5);
  expect(formatPublishedNumber(12.5, 1)).toBe((12.5).toLocaleString(undefined, { maximumFractionDigits: 1 }));
});

test('map text survives an HTML roundtrip without becoming markup', () => {
  const text = '<img src="x" onerror=\'alert(1)\'> & <script>no</script>';
  const root = document.createElement('div');
  root.innerHTML = escapeMapText(text);
  expect(root.children.length).toBe(0);
  expect(root.textContent).toBe(text);
});
