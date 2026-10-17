/**
 * The continue button's locked and unlocked states.
 *
 * While locked the button stays focusable and says why through
 * aria-describedby (the gate line), instead of being a silent disabled
 * control. The gate line is not a live region: a per-second countdown read
 * aloud would drown out everything else on the page.
 */

import { ContinueBlock, DAILY_LIMIT_ANCHOR, OPTIONS_PATH } from '../constants.js';

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
 * The line shown once the daily allowance is used up (continues today at or
 * over the limit). It says why the wait is longer; the gate line above it
 * already gives the seconds, and continue itself stays on the page.
 *
 * @param {{siteName: string, dailyContinueLimit: number}} view The
 *   GET_RESOLVED_SITE response.
 * @returns {string}
 */
export function overLimitMessage({ siteName, dailyContinueLimit }) {
  return `You've reached your daily limit of ${dailyContinueLimit} for ${siteName}, so the pause is longer today.`;
}

/**
 * Show the over-limit line, with its link straight to the limit setting.
 *
 * @param {HTMLElement} line The `#limit` paragraph: a text span and a link.
 * @param {object} view The GET_RESOLVED_SITE response.
 */
export function showOverLimit(line, view) {
  line.querySelector('#limit-text').textContent = overLimitMessage(view);
  line.querySelector('a').href = chrome.runtime.getURL(`${OPTIONS_PATH}#${DAILY_LIMIT_ANCHOR}`);
  line.hidden = false;
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
