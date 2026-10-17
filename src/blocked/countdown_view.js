/**
 * Auto-continue: show the pause briefly, then go to the destination unless
 * the user stops it. Stopping means "let me think", never "take me to the
 * site".
 */

import { MS_PER_SECOND } from '../constants.js';

/**
 * @param {{countdown: HTMLElement, countdownTarget: HTMLElement,
 *   countdownSeconds: HTMLElement, goTarget: HTMLElement,
 *   continueGroup: HTMLElement, status: HTMLElement}} elements
 * @param {{seconds: number, targetName: string, onArrive: () => void}} options
 *   `onArrive` runs when the countdown reaches zero.
 * @returns {{stop: () => void}} `stop` does nothing once the countdown has
 *   stopped or arrived.
 */
export function startCountdown(elements, { seconds, targetName, onArrive }) {
  let remaining = seconds;
  elements.countdownTarget.textContent = targetName;
  elements.countdownSeconds.textContent = `${remaining}s`;
  elements.countdown.hidden = false;
  elements.goTarget.hidden = true;
  elements.continueGroup.hidden = true;
  // Announced once through the live status line, not every second: the
  // seconds themselves are not a live region.
  elements.status.textContent = `Going to ${targetName} in ${seconds} seconds. Press Stop or Escape to stay.`;

  let timer = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      elements.countdownSeconds.textContent = `${remaining}s`;
      return;
    }
    window.clearInterval(timer);
    timer = null;
    onArrive();
  }, MS_PER_SECOND);

  return {
    stop() {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
      elements.countdown.hidden = true;
      elements.goTarget.hidden = false;
      elements.continueGroup.hidden = false;
      elements.status.textContent = 'Stopped. Your call.';
      // The Stop button just disappeared; keep keyboard focus on the page.
      elements.goTarget.focus();
    },
  };
}
