/**
 * Pure decisions behind the pause screen.
 *
 * Everything here is a function of the resolved settings and `n`, the site's
 * lifetime interception count before this one. No new state is stored: the
 * variant, the rotating style and the reason shown all follow from `n`.
 *
 * No chrome.*, no DOM, no clock — unit-tested in Node.
 */

import {
  BREATH_CYCLE_SECONDS,
  DESTINATION_FALLBACK_LABEL,
  PAUSE_PROMPTS,
  PAUSE_ROTATION,
  PRESENTATION_LAYOUTS,
  PRESENTATION_PALETTES,
  PauseStyle,
} from '../constants.js';
import { hostnameOf, siteLabel } from './rules.js';

const KNOWN_STYLES = Object.freeze(Object.values(PauseStyle));

/**
 * @param {number} n
 * @param {string} caller For the error message.
 */
function assertCount(n, caller) {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${caller}: n must be a non-negative integer, got ${JSON.stringify(n)}`);
  }
}

/**
 * The presentation for the n-th interception. Each list has at least two
 * entries, so consecutive interceptions differ in all three.
 *
 * @param {number} n
 * @returns {{layout: string, palette: string, prompt: {lead: string, reasonLead: string}}}
 */
export function presentationVariant(n) {
  assertCount(n, 'presentationVariant');
  return {
    layout: PRESENTATION_LAYOUTS[n % PRESENTATION_LAYOUTS.length],
    palette: PRESENTATION_PALETTES[n % PRESENTATION_PALETTES.length],
    prompt: PAUSE_PROMPTS[n % PAUSE_PROMPTS.length],
  };
}

/**
 * The style to show this time: `rotate` cycles reason, breathing, intention.
 *
 * @param {string} style A PauseStyle value.
 * @param {number} n
 * @returns {string} A concrete style (never `rotate`).
 */
export function concretePauseStyle(style, n) {
  assertCount(n, 'concretePauseStyle');
  if (!KNOWN_STYLES.includes(style)) {
    throw new Error(`concretePauseStyle: unknown pause style "${style}"`);
  }
  return style === PauseStyle.ROTATE ? PAUSE_ROTATION[n % PAUSE_ROTATION.length] : style;
}

/**
 * The reason to show this time, independent of the style.
 *
 * When rotating, the reason advances once per full rotation (k = floor(n/3)),
 * so with reasons [a, b, c] the reason screen shows a, b, c in turn and every
 * reason meets every style. Indexing by n alone would pair each reason with
 * one style forever whenever the counts share a factor.
 *
 * @param {string[]} reasons
 * @param {number} n
 * @param {boolean} isRotating Whether the configured style is `rotate`.
 * @returns {string} The reason, or '' when there is none.
 */
export function pickReason(reasons, n, isRotating) {
  assertCount(n, 'pickReason');
  if (!Array.isArray(reasons)) {
    throw new Error(`pickReason: reasons must be a list, got ${typeof reasons}`);
  }
  if (reasons.length === 0) {
    return '';
  }
  const k = isRotating ? Math.floor(n / PAUSE_ROTATION.length) : n;
  return reasons[k % reasons.length];
}

/**
 * Auto-continue, as it applies to a concrete style. The intention style asks
 * the user to type; moving on without them would make the question pointless.
 *
 * @param {string} style A concrete style.
 * @param {boolean} autoContinue The resolved setting.
 * @returns {boolean}
 */
export function effectiveAutoContinue(style, autoContinue) {
  return style === PauseStyle.INTENTION ? false : autoContinue;
}

/**
 * Breaths the breathing style paces for a pause length: one 10-second breath
 * per started 10 seconds, and at least one.
 *
 * @param {number} pauseSeconds
 * @returns {number}
 */
export function breathCountFor(pauseSeconds) {
  if (!Number.isInteger(pauseSeconds) || pauseSeconds < 0) {
    throw new Error(`breathCountFor: pauseSeconds must be a non-negative integer, got ${pauseSeconds}`);
  }
  return Math.max(1, Math.ceil(pauseSeconds / BREATH_CYCLE_SECONDS));
}

/**
 * Everything the pause page needs to render one interception.
 *
 * The worker owns the display fallbacks (the site's label, the destination's
 * hostname) so the page shows what it receives and has none of its own.
 *
 * @param {object} resolved Effective settings (resolveSettings output).
 * @param {object|null} site The matched site, or null.
 * @param {number} n The site's interception count before this one.
 * @param {{host: string}} context `host` is the requested hostname.
 * @returns {object}
 */
export function presentSite(resolved, site, n, context) {
  if (typeof context?.host !== 'string' || context.host === '') {
    throw new Error('presentSite: context.host is required');
  }
  const pauseStyle = concretePauseStyle(resolved.pauseStyle, n);

  return {
    siteName: site ? siteLabel(site) : context.host,
    target: resolved.target,
    targetName: resolved.targetName.trim() || hostnameOf(resolved.target) || DESTINATION_FALLBACK_LABEL,
    reason: pickReason(resolved.reasons, n, resolved.pauseStyle === PauseStyle.ROTATE),
    pauseStyle,
    variant: presentationVariant(resolved.varyPresentation ? n : 0),
    pauseSeconds: resolved.pauseSeconds,
    breathCount: breathCountFor(resolved.pauseSeconds),
    autoContinue: effectiveAutoContinue(pauseStyle, resolved.autoContinue),
    countdownSeconds: resolved.countdownSeconds,
    bypassMinutes: resolved.bypassMinutes,
  };
}
