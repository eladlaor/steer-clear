/**
 * Editor for a list of reasons: up to MAX_REASONS_PER_SITE, each limited to
 * REASON_INPUT_MAX_CHARS by the input (stored reasons have no limit, so a
 * long note migrated from 1.x still shows in full).
 *
 * Blank entries are kept on screen while the user fills them, and left out
 * of what is reported.
 */

import { MAX_REASONS_PER_SITE, REASON_INPUT_MAX_CHARS } from '../constants.js';

const REASON_PLACEHOLDER = "I said I'd stop doomscrolling during work hours.";

/**
 * @param {{id: string, onChange: (reasons: string[]) => void}} options `id`
 *   goes on the first input, so a label can point at it.
 * @returns {{element: HTMLElement, set: (reasons: string[]) => void}}
 */
export function createReasonsEditor({ id, onChange }) {
  const list = document.createElement('ol');
  list.className = 'reason-list';

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn-ghost btn-small reason-add';
  add.textContent = 'Add another reason';

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = `Up to ${MAX_REASONS_PER_SITE}. One is shown each time, taking turns.`;

  const element = document.createElement('div');
  element.className = 'reasons';
  element.append(list, add, hint);

  const values = () =>
    [...list.querySelectorAll('textarea')].map((input) => input.value.trim()).filter((value) => value !== '');

  // Keep the add button, the first input's id and the numbered labels
  // consistent with the rows on screen.
  const syncRows = () => {
    add.hidden = list.children.length >= MAX_REASONS_PER_SITE;
    [...list.querySelectorAll('textarea')].forEach((input, index) => {
      if (index === 0) input.id = id;
      else input.removeAttribute('id');
      input.setAttribute('aria-label', `Reason ${index + 1}`);
    });
  };

  const appendRow = (value) => {
    const input = document.createElement('textarea');
    input.rows = 2;
    input.maxLength = REASON_INPUT_MAX_CHARS;
    input.placeholder = REASON_PLACEHOLDER;
    input.value = value;
    input.addEventListener('input', () => onChange(values()));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      row.remove();
      if (list.children.length === 0) appendRow('');
      syncRows();
      onChange(values());
    });

    const row = document.createElement('li');
    row.className = 'reason-row';
    row.append(input, remove);
    list.append(row);
    syncRows();
    return input;
  };

  add.addEventListener('click', () => appendRow('').focus());

  return {
    element,
    set(reasons) {
      list.replaceChildren();
      for (const reason of reasons) appendRow(reason);
      if (reasons.length === 0) appendRow('');
      syncRows();
    },
  };
}
