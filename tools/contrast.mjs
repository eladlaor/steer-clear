/**
 * WCAG contrast checks over the colour tokens in src/shared/tokens.css.
 *
 * Pure: parses CSS text and computes ratios. tests/unit/contrast.test.js
 * runs it over the base tokens and every presentation palette, in light and
 * dark, so a palette that fails AA cannot ship.
 *
 * Expected tokens.css shape: light rules at the top level, dark rules inside
 * one `@media (prefers-color-scheme: dark) { ... }` block. In each scheme,
 * `:root` holds the base tokens and `:root[data-palette="<name>"]` a
 * palette's overrides.
 */

/** WCAG 2 AA minimum for body text. */
export const AA_TEXT_RATIO = 4.5;

/** Text/background token pairs every scheme and palette must pass. */
export const REQUIRED_PAIRS = Object.freeze([
  ['--ink', '--bg'],
  ['--ink', '--card'],
  ['--ink-soft', '--card'],
  // The pause page's variation notice and the intention field sit on --bg.
  ['--ink-soft', '--bg'],
  ['--accent-ink', '--accent'],
  ['--danger', '--card'],
]);

const DARK_MEDIA = '@media (prefers-color-scheme: dark)';
const ROOT_SELECTOR = ':root';
const PALETTE_SELECTOR = /^:root\[data-palette="([a-z-]+)"\]$/;

/**
 * @param {string} hex `#rgb` or `#rrggbb`.
 * @returns {[number, number, number]} 0–255 channels.
 */
export function hexToRgb(hex) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    throw new Error(`hexToRgb: "${hex}" is not a #rgb or #rrggbb colour`);
  }
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join('') : match[1];
  return [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16));
}

/**
 * @param {string} hex
 * @returns {number} WCAG relative luminance, 0–1.
 */
export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} foreground Hex colour.
 * @param {string} background Hex colour.
 * @returns {number} Contrast ratio, 1–21.
 */
export function contrastRatio(foreground, background) {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Split off the dark-scheme media block by brace matching.
 *
 * @param {string} css
 * @returns {{light: string, dark: string}}
 */
function splitSchemes(css) {
  const start = css.indexOf(DARK_MEDIA);
  if (start === -1) {
    throw new Error(`parseTokenSets: no "${DARK_MEDIA}" block found`);
  }
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) {
      return { light: css.slice(0, start) + css.slice(i + 1), dark: css.slice(open + 1, i) };
    }
  }
  throw new Error('parseTokenSets: unbalanced braces in the dark-scheme block');
}

/**
 * @param {string} body A rule body.
 * @returns {Object<string, string>} Custom properties declared in it.
 */
function declarations(body) {
  const tokens = {};
  for (const [, name, value] of body.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

/**
 * @param {string} css One scheme's rules, without nested blocks.
 * @returns {{base: Object<string, string>, palettes: Object<string, Object<string, string>>}}
 */
function parseScheme(css) {
  const scheme = { base: {}, palettes: {} };
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, rawSelector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rawSelector.trim();
    if (selector === ROOT_SELECTOR) {
      Object.assign(scheme.base, declarations(body));
      continue;
    }
    const palette = PALETTE_SELECTOR.exec(selector);
    if (palette) {
      scheme.palettes[palette[1]] = declarations(body);
    }
  }
  return scheme;
}

/**
 * Parse tokens.css into base tokens and palette overrides per scheme.
 *
 * @param {string} css The text of tokens.css.
 * @returns {{light: object, dark: object}} Each `{ base, palettes }`.
 */
export function parseTokenSets(css) {
  const { light, dark } = splitSchemes(css);
  return { light: parseScheme(light), dark: parseScheme(dark) };
}

/**
 * Every required pair that fails AA for one effective token set.
 *
 * @param {Object<string, string>} tokens Base tokens with a palette applied.
 * @returns {string[]} Descriptions of the failures; empty when all pass.
 */
export function contrastFailures(tokens) {
  const failures = [];
  for (const [fg, bg] of REQUIRED_PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      failures.push(`${fg} on ${bg}: token missing`);
      continue;
    }
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    if (ratio < AA_TEXT_RATIO) {
      failures.push(`${fg} ${tokens[fg]} on ${bg} ${tokens[bg]}: ${ratio.toFixed(2)}:1`);
    }
  }
  return failures;
}
