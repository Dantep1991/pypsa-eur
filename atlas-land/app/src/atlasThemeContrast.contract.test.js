import fs from 'fs';
import path from 'path';

const source = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

test('settings modal owns an explicit themed surface and foreground contract', () => {
  const css = source('index.css');
  expect(css).toMatch(/\.atlas-modal\s*\{[\s\S]*background:\s*var\(--bg-surface\)[\s\S]*color:\s*var\(--text-primary\)/);
  expect(css).toMatch(/\.atlas-modal__body\s*\{\s*background:\s*var\(--bg-base\)/);
  expect(css).toMatch(/\.atlas-modal__description\s*\{\s*color:\s*var\(--text-secondary\)/);
  expect(css).toMatch(/\.atlas-settings-card\s*\{[\s\S]*background:\s*var\(--bg-elevated\)[\s\S]*color:\s*var\(--text-primary\)/);
});

test('modal markup uses semantic theme classes rather than dark-only text colours', () => {
  const modal = source('components/AtlasModal.js');
  expect(modal).toContain('atlas-modal__title');
  expect(modal).toContain('atlas-modal__description');
  expect(modal).not.toMatch(/text-(?:white|slate-\d+)/);
});

test('legacy settings text transparencies resolve to readable theme tokens', () => {
  const css = source('index.css');
  expect(css).toMatch(/\.atlas-shell \.text-white\\\/75,[\s\S]*color:\s*var\(--text-secondary\)/);
  expect(css).toMatch(/\.atlas-shell \.text-slate-500[\s\S]*color:\s*var\(--text-muted\)/);
  expect(css).toMatch(/\.atlas-shell \.bg-tj-navy-light\\\/45,[\s\S]*background-color:\s*var\(--control-surface-strong\)/);
});
