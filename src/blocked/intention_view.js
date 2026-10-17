/**
 * The intention exercise: "What did you come here for?" with a text field.
 *
 * What the user types stays in this page's memory only. It is never sent to
 * the worker, stored or logged.
 */

import { REASON_INPUT_MAX_CHARS } from '../constants.js';

const INTENTION_LABEL = 'What did you come here for?';
const INTENTION_INPUT_ID = 'intention-input';

/**
 * Mount the exercise.
 *
 * @param {HTMLElement} container Where to render.
 * @param {{onInput: (text: string) => void}} options Called on every edit.
 * @returns {HTMLInputElement} The field, which the page focuses first.
 */
export function mountIntentionView(container, { onInput }) {
  const root = document.createElement('div');
  root.className = 'intention';

  const label = document.createElement('label');
  label.className = 'intention-label';
  label.htmlFor = INTENTION_INPUT_ID;
  label.textContent = INTENTION_LABEL;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = INTENTION_INPUT_ID;
  input.className = 'intention-input';
  input.maxLength = REASON_INPUT_MAX_CHARS;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('input', () => onInput(input.value));

  root.append(label, input);
  container.replaceChildren(root);
  return input;
}
