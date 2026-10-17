/**
 * The continue button's locked and unlocked states.
 *
 * While locked the button stays focusable and says why through
 * aria-describedby (the gate line), instead of being a silent disabled
 * control. The gate line is not a live region: a per-second countdown read
 * aloud would drown out everything else on the page.
 */

import { ContinueBlock } from '../constants.js';

/**
 * @param {{blockedBy: string|null, remainingSeconds: number}} gate
 * @returns {string} Why continue is locked, or '' when it is not.
 */
export function gateMessage(gate) {
  switch (gate.blockedBy) {
    case ContinueBlock.BREATHING:
      return 'Continue unlocks after your breaths.';
    case ContinueBlock.INTENTION:
      return 'Continue unlocks once you write what you came for.';
    case ContinueBlock.WAITING:
      return `Continue unlocks in ${gate.remainingSeconds} s.`;
    case null:
      return '';
    default:
      throw new Error(`gateMessage: unknown block "${gate.blockedBy}"`);
  }
}

/**
 * Render a gate state onto the continue button and its gate line.
 *
 * @param {{button: HTMLButtonElement, gateLine: HTMLElement}} elements
 * @param {{enabled: boolean, blockedBy: string|null, remainingSeconds: number}} gate
 */
export function renderGate({ button, gateLine }, gate) {
  const locked = String(!gate.enabled);
  if (button.getAttribute('aria-disabled') !== locked) {
    button.setAttribute('aria-disabled', locked);
  }
  const message = gateMessage(gate);
  if (gateLine.textContent !== message) {
    gateLine.textContent = message;
  }
}
