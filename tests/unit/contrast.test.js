/**
 * WCAG AA contrast for the shared tokens and every presentation palette.
 * Run: node --test tests/unit/
 *
 * The pause page changes palette on every interception, so every palette has
 * to be readable in both colour schemes, not just the one someone looked at.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  contrastRatio,
  contrastFailures,
  parseTokenSets,
} from '../../tools/contrast.mjs';
import { PRESENTATION_PALETTES } from '../../src/constants.js';

const tokensCss = readFileSync(new URL('../../src/shared/tokens.css', import.meta.url), 'utf8');
const sets = parseTokenSets(tokensCss);

test('contrastRatio matches known WCAG values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#fff', '#fff'), 1);
  assert.ok(Math.abs(contrastRatio('#767676', '#ffffff') - 4.54) < 0.01);
});

test('the base tokens pass AA in light and dark', () => {
  for (const scheme of ['light', 'dark']) {
    assert.deepEqual(contrastFailures(sets[scheme].base), [], scheme);
  }
});

test('every presentation palette is defined in both schemes with the same tokens', () => {
  for (const name of PRESENTATION_PALETTES) {
    const light = sets.light.palettes[name];
    const dark = sets.dark.palettes[name];
    assert.ok(light, `${name} has a light block`);
    assert.ok(dark, `${name} has a dark block`);
    assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort(), name);
  }
});

test('every presentation palette passes AA in light and dark', () => {
  for (const name of PRESENTATION_PALETTES) {
    for (const scheme of ['light', 'dark']) {
      const tokens = { ...sets[scheme].base, ...sets[scheme].palettes[name] };
      assert.deepEqual(contrastFailures(tokens), [], `${name} (${scheme})`);
    }
  }
});

test('consecutive palettes look different', () => {
  for (let i = 0; i < PRESENTATION_PALETTES.length; i += 1) {
    const a = sets.light.palettes[PRESENTATION_PALETTES[i]];
    const b = sets.light.palettes[PRESENTATION_PALETTES[(i + 1) % PRESENTATION_PALETTES.length]];
    assert.notEqual(a['--accent'], b['--accent']);
  }
});

test('no stylesheet fades text with opacity, except for controls that are unavailable', async () => {
  // The token pairs above pass AA, but opacity lowers the drawn contrast
  // (".btn-sub" at 0.75 measured 3.3:1). Disabled controls are exempt from
  // the contrast requirement and may fade.
  const { readdirSync } = await import('node:fs');
  const srcDir = new URL('../../src/', import.meta.url);
  const sheets = readdirSync(srcDir, { recursive: true }).filter((file) => file.endsWith('.css'));
  const offenders = [];
  for (const file of sheets) {
    const css = readFileSync(new URL(file, srcDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const opacity = body.match(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/);
      if (!opacity || Number(opacity[1]) >= 1) continue;
      if (/disabled/.test(selector)) continue;
      offenders.push(`${file}: ${selector.trim()} { opacity: ${opacity[1]} }`);
    }
  }
  assert.ok(sheets.length > 0, 'found the stylesheets');
  assert.deepEqual(offenders, []);
});
