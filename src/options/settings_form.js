/**
 * One generic form over the SiteSettings fields, used for the global
 * defaults and for each site's overrides.
 *
 * Main section: reasons, destination and its name, pause style. A collapsed
 * Advanced section holds the rest. In site mode only per-site fields appear,
 * each showing whether it is the site's own value, with "Use default" to
 * inherit again.
 *
 * The form never writes storage: it reports patches and clears to its owner,
 * which sends them to the worker. `update()` re-renders from storage without
 * touching the control the user is typing in.
 */

import {
  BYPASS_MINUTES_OPTIONS,
  MAX_COUNTDOWN_SECONDS,
  MAX_PAUSE_SECONDS,
  MIN_COUNTDOWN_SECONDS,
  MIN_PAUSE_SECONDS,
  PauseStyle,
  SETTINGS_SAVE_DELAY_MS,
  SettingsFormMode,
  SOURCE_URL_PROTOCOLS,
} from '../constants.js';
import { PER_SITE_FIELDS, resolveSettings } from '../background/settings_schema.js';
import { createReasonsEditor } from './reasons_editor.js';


const STYLE_CHOICES = Object.freeze([
  [PauseStyle.REASON, 'Your reason', 'Shows your reason and the two choices.'],
  [PauseStyle.BREATHING, 'Breathing', 'One slow breath per 10 s of pause (at least one) before you can continue.'],
  [PauseStyle.INTENTION, 'Intention', 'Asks what you came for; continue unlocks once you type it. Nothing typed is saved.'],
  [PauseStyle.ROTATE, 'Rotate', 'Reason, then breathing, then intention, one per visit.'],
]);

/**
 * The fields, in display order. `kind` picks the control; `advanced` puts it
 * under the collapsed section; `id` is a stable anchor for links.
 */
const FIELD_UI = Object.freeze([
  { key: 'reasons', kind: 'reasons', label: 'Remind me why' },
  { key: 'target', kind: 'url', label: 'Send me to', placeholder: 'https://example.com' },
  { key: 'targetName', kind: 'text', label: 'Call that place', hint: 'Shown on the button. Leave blank to show its address.', placeholder: 'Wikipedia' },
  { key: 'pauseStyle', kind: 'style', label: 'Pause style' },
  { key: 'pauseSeconds', kind: 'number', advanced: true, label: 'Pause length (seconds)', min: MIN_PAUSE_SECONDS, max: MAX_PAUSE_SECONDS, hint: 'Continue unlocks after this long. 0 = right away.' },
  { key: 'bypassMinutes', kind: 'bypass', advanced: true, label: 'When I continue, let me in for' },
  { key: 'returnPauseOnExpiry', kind: 'checkbox', advanced: true, label: 'When my time is up, bring the pause back', hint: 'Open tabs on the site return to the pause page, even on sites that never reload.' },
  { key: 'varyPresentation', kind: 'checkbox', advanced: true, id: 'vary-presentation', label: 'Vary how the pause screen looks', hint: 'Layout, colour and wording change each time, so the screen stays noticeable.' },
  { key: 'autoContinue', kind: 'checkbox', advanced: true, label: "Don't wait for me — go to my destination automatically", hint: 'The pause still appears, then moves on by itself unless you stop it.' },
  { key: 'countdownSeconds', kind: 'number', advanced: true, label: 'Go automatically after (seconds)', min: MIN_COUNTDOWN_SECONDS, max: MAX_COUNTDOWN_SECONDS },
]);

const INTENTION_AUTO_HINT = 'Off for the intention style: it waits for you to type.';

/**
 * @param {string} tag
 * @param {object} [props] Properties assigned to the element.
 * @param {Array<Node|string>} [children]
 * @returns {HTMLElement}
 */
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * Create a settings form.
 *
 * @param {HTMLElement} container
 * @param {{mode: 'defaults'|'site', idPrefix: string,
 *   onPatch: (patch: object) => void, onClear: (key: string) => void,
 *   onError: (message: string) => void}} options
 * @returns {{update: (defaults: object, site?: object) => void}}
 */
export function createSettingsForm(container, { mode, idPrefix, onPatch, onClear, onError }) {
  if (!Object.values(SettingsFormMode).includes(mode)) {
    throw new Error(`createSettingsForm: unknown mode "${mode}"`);
  }
  const isSite = mode === SettingsFormMode.SITE;
  const fields = FIELD_UI.filter((field) => !isSite || PER_SITE_FIELDS.includes(field.key));
  const controls = new Map();
  const timers = new Map();

  // `check` returns an error message, or '' when the value can be saved.
  const saveLater = (key, value, check = () => '') => {
    window.clearTimeout(timers.get(key));
    timers.set(
      key,
      window.setTimeout(() => {
        const problem = check(value);
        if (problem) onError(problem);
        else save(key, value);
      }, SETTINGS_SAVE_DELAY_MS)
    );
  };

  // Blank text in site mode means "use the default", as it did in 1.x.
  const save = (key, value) => {
    const blank = value === '' || (Array.isArray(value) && value.length === 0);
    if (isSite && blank) onClear(key);
    else onPatch({ [key]: value });
  };

  const main = el('div', { className: 'form-main' });
  const advancedBody = el('div', { className: 'form-advanced-body' });
  const advanced = el('details', { className: 'form-advanced' }, [
    el('summary', { textContent: 'Advanced' }),
    advancedBody,
  ]);

  for (const field of fields) {
    const id = field.id && !isSite ? field.id : `${idPrefix}-${field.key}`;
    const control = buildControl(field, id, { save, saveLater, onError, isSite });
    const useDefault = el('button', { type: 'button', className: 'link use-default', textContent: 'Use default', hidden: true });
    useDefault.addEventListener('click', () => onClear(field.key));
    const tag = el('span', { className: 'field-tag' });
    const head = el('div', { className: 'field-head' }, [control.label, ...(isSite ? [tag, useDefault] : [])]);
    const hint = el('p', { className: 'hint field-hint', textContent: field.hint ?? '' });
    const wrapper = el('div', { className: `field field-${field.kind}` }, [head, control.input, hint]);
    (field.advanced ? advancedBody : main).append(wrapper);
    controls.set(field.key, { ...control, wrapper, useDefault, tag, hint, field });
  }

  container.replaceChildren(main, advanced);

  return {
    update(defaults, site = null) {
      const effective = resolveSettings(defaults, site);
      for (const [key, control] of controls) {
        control.set(effective[key]);
        if (isSite) {
          const own = key in site.overrides;
          control.useDefault.hidden = !own;
          control.tag.textContent = own ? 'This site' : 'Default';
        }
      }
      // Auto-continue only matters with a countdown, and never with the
      // intention style, which waits for the user to type.
      const intention = effective.pauseStyle === PauseStyle.INTENTION;
      const auto = controls.get('autoContinue');
      auto.input.querySelector('input').disabled = intention;
      auto.hint.textContent = intention ? INTENTION_AUTO_HINT : auto.field.hint;
      controls.get('countdownSeconds').wrapper.hidden = intention || !effective.autoContinue;
    },
  };
}

/**
 * Build one field's control.
 *
 * @returns {{label: HTMLElement, input: HTMLElement, set: (value: unknown) => void}}
 */
function buildControl(field, id, { save, saveLater, onError, isSite }) {
  const label = el('label', { className: 'label', htmlFor: id, textContent: field.label });
  const focused = (node) => node.contains(document.activeElement);

  switch (field.kind) {
    case 'reasons': {
      const editor = createReasonsEditor({ id, onChange: (reasons) => saveLater(field.key, reasons) });
      return { label, input: editor.element, set: (value) => focused(editor.element) || editor.set(value) };
    }
    case 'url':
    case 'text': {
      const input = el('input', { type: field.kind, id, placeholder: field.placeholder ?? '' });
      const check = (value) => {
        if (field.kind !== 'url') return '';
        if (value === '') return isSite ? '' : 'A default destination is required';
        return isWebUrl(value) ? '' : 'The destination must be a full web address, like https://example.com';
      };
      input.addEventListener('input', () => saveLater(field.key, input.value.trim(), check));
      return { label, input, set: (value) => focused(input) || (input.value = value) };
    }
    case 'style': {
      const select = el('select', { id }, STYLE_CHOICES.map(([value, text]) => el('option', { value, textContent: text })));
      const describe = el('p', { className: 'hint style-hint' });
      const box = el('div', {}, [select, describe]);
      const sync = () => {
        describe.textContent = STYLE_CHOICES.find(([value]) => value === select.value)[2];
      };
      select.addEventListener('change', () => {
        sync();
        save(field.key, select.value);
      });
      return { label, input: box, set: (value) => { select.value = value; sync(); } };
    }
    case 'bypass': {
      const select = el('select', { id }, BYPASS_MINUTES_OPTIONS.map((m) => el('option', { value: String(m), textContent: `${m} minute${m === 1 ? '' : 's'}` })));
      select.addEventListener('change', () => save(field.key, Number(select.value)));
      return { label, input: select, set: (value) => { select.value = String(value); } };
    }
    case 'number': {
      const input = el('input', { type: 'number', id, min: field.min, max: field.max, step: 1 });
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!Number.isInteger(value) || value < field.min || value > field.max) {
          onError(`${field.label} must be a whole number from ${field.min} to ${field.max}`);
          return;
        }
        save(field.key, value);
      });
      return { label, input, set: (value) => focused(input) || (input.value = String(value)) };
    }
    case 'checkbox': {
      const input = el('input', { type: 'checkbox', id });
      input.addEventListener('change', () => save(field.key, input.checked));
      const box = el('label', { className: 'check', htmlFor: id }, [input, el('span', { textContent: field.label })]);
      // The checkbox's own label carries the text; the field head stays empty.
      return { label: el('span'), input: box, set: (value) => { input.checked = value; } };
    }
    default:
      throw new Error(`settings_form: unknown field kind "${field.kind}"`);
  }
}

/**
 * @param {string} value
 * @returns {boolean} Whether it parses as an http(s) URL.
 */
function isWebUrl(value) {
  try {
    return SOURCE_URL_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
