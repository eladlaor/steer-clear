/**
 * When the pause page's continue button unlocks.
 *
 * Two conditions, both required: the style's own gate (reason: none;
 * breathing: every breath done; intention: something typed) and the pause
 * length elapsed since the page rendered. Friction, never a wall: given time
 * and input, it always opens.
 *
 * Pure: the page passes in elapsed time and what the user has done.
 */

import { ContinueBlock, MIN_INTENTION_CHARS, MS_PER_SECOND, PauseStyle } from '../constants.js';

/**
 * @param {string} text
 * @returns {number} Characters that are not whitespace.
 */
function nonSpaceLength(text) {
  return text.replace(/\s/g, '').length;
}

/**
 * The style's own condition, or null when it is met.
 *
 * @param {{style: string, breathsDone: number, breathCount: number,
 *   intentionText: string}} state
 * @returns {string|null} A ContinueBlock value.
 */
function styleBlock({ style, breathsDone, breathCount, intentionText }) {
  switch (style) {
    case PauseStyle.REASON:
      return null;
    case PauseStyle.BREATHING:
      return breathsDone < breathCount ? ContinueBlock.BREATHING : null;
    case PauseStyle.INTENTION:
      return nonSpaceLength(intentionText ?? '') < MIN_INTENTION_CHARS ? ContinueBlock.INTENTION : null;
    case PauseStyle.ROTATE:
      throw new Error('continueGate: style must be concrete; resolve rotate with concretePauseStyle first');
    default:
      throw new Error(`continueGate: unknown pause style "${style}"`);
  }
}

/**
 * Whether continue is enabled, what blocks it, and the wait left.
 *
 * @param {{style: string, pauseSeconds: number, elapsedMs: number,
 *   breathsDone: number, breathCount: number, intentionText: string}} state
 *   `pauseSeconds` is the effective pause; `elapsedMs` counts from render.
 * @returns {{enabled: boolean, blockedBy: string|null, remainingSeconds: number}}
 *   `blockedBy` names the style's condition first, then the wait.
 */
export function continueGate(state) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((state.pauseSeconds * MS_PER_SECOND - state.elapsedMs) / MS_PER_SECOND)
  );
  const blockedBy = styleBlock(state) ?? (remainingSeconds > 0 ? ContinueBlock.WAITING : null);
  return { enabled: blockedBy === null, blockedBy, remainingSeconds };
}
