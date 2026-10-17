/**
 * The breathing exercise: a circle that grows on the in-breath and shrinks on
 * the out-breath, with a text cue and a counter ("1 of 2").
 *
 * The circle is decoration (aria-hidden); the cue is the accessible signal.
 * Under prefers-reduced-motion the CSS removes the scaling, and the cue and
 * counter keep the same timing.
 */

import { BREATH_EXHALE_MS, BREATH_INHALE_MS } from '../constants.js';

const CUE_IN = 'Breathe in';
const CUE_OUT = 'Breathe out';
const CUE_DONE = 'Done. Your call.';

/**
 * Mount the exercise and start it.
 *
 * @param {HTMLElement} container Where to render.
 * @param {{breathCount: number, onBreath: (breathsDone: number) => void}} options
 *   `onBreath` runs after each completed breath.
 * @returns {{stop: () => void}}
 */
export function mountBreathingView(container, { breathCount, onBreath }) {
  const root = document.createElement('div');
  root.className = 'breathing';

  const circle = document.createElement('div');
  circle.className = 'breath-circle';
  circle.setAttribute('aria-hidden', 'true');

  const cue = document.createElement('p');
  cue.className = 'breath-cue';
  cue.setAttribute('aria-live', 'polite');

  const counter = document.createElement('p');
  counter.className = 'breath-count';

  root.append(circle, cue, counter);
  container.replaceChildren(root);

  let timer = null;
  let breathsDone = 0;

  const inhale = () => {
    counter.textContent = `${breathsDone + 1} of ${breathCount}`;
    cue.textContent = CUE_IN;
    circle.style.transitionDuration = `${BREATH_INHALE_MS}ms`;
    circle.classList.remove('is-exhale');
    circle.classList.add('is-inhale');
    timer = window.setTimeout(exhale, BREATH_INHALE_MS);
  };

  const exhale = () => {
    cue.textContent = CUE_OUT;
    circle.style.transitionDuration = `${BREATH_EXHALE_MS}ms`;
    circle.classList.replace('is-inhale', 'is-exhale');
    timer = window.setTimeout(finishBreath, BREATH_EXHALE_MS);
  };

  const finishBreath = () => {
    breathsDone += 1;
    onBreath(breathsDone);
    if (breathsDone < breathCount) {
      inhale();
      return;
    }
    timer = null;
    cue.textContent = CUE_DONE;
  };

  // Lay out the resting size first, so the first in-breath animates from it.
  circle.getBoundingClientRect();
  inhale();

  return {
    stop() {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    },
  };
}
