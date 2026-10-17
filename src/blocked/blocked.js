/**
 * Steer Clear pause page controller.
 *
 * Reads the originally-requested URL, asks the worker what to show, applies
 * the presentation variant, mounts the style's view and gates the continue
 * button. Rendering details live in the *_view.js modules. Never touches
 * declarativeNetRequest — the worker owns rules.
 */

import { LifecycleEvent, MessageType, PauseStyle, STOP_COUNTDOWN_KEY } from '../constants.js';
import { sendMessage } from '../shared/messaging.js';
import { extractSourceUrl } from '../shared/source_url.js';
import { continueGate } from '../background/continue_gate.js';
import { mountBreathingView } from './breathing_view.js';
import { mountIntentionView } from './intention_view.js';
import { renderGate, showOverLimit } from './continue_view.js';
import { startCountdown } from './countdown_view.js';
import { recordSteered, trackView } from './view_tracking.js';

/** How often the continue gate is re-evaluated, in ms. */
const GATE_TICK_MS = 250;

const $ = (id) => document.getElementById(id);
const elements = {
  lead: $('lead'),
  host: $('host'),
  reason: $('reason'),
  reasonLead: $('reason-lead'),
  note: $('note'),
  exercise: $('exercise'),
  goTarget: $('go-target'),
  goTargetLabel: $('go-target-label'),
  continueGroup: $('continue-group'),
  bypass: $('bypass'),
  bypassLabel: $('bypass-label'),
  bypassMinutes: $('bypass-minutes'),
  gate: $('gate'),
  limit: $('limit'),
  countdown: $('countdown'),
  countdownTarget: $('countdown-target'),
  countdownSeconds: $('countdown-seconds'),
  stop: $('stop'),
  status: $('status'),
  notice: $('variation-notice'),
  noticeOk: $('notice-ok'),
  openOptions: $('open-options'),
};

/** What the gate depends on; updated by the views. */
const gateState = { breathsDone: 0, intentionText: '' };
let currentGate = { enabled: false };
/** The running auto-continue countdown, if any. */
let countdown = null;
/** The id this view is recorded under, once the page has been seen. */
let viewEvent = Promise.resolve(null);

/**
 * Apply the presentation variant: layout class, palette tokens, wording.
 *
 * @param {{layout: string, palette: string, prompt: {lead: string, reasonLead: string}}} variant
 */
function applyVariant(variant) {
  document.body.className = `layout-${variant.layout}`;
  document.documentElement.dataset.palette = variant.palette;
  elements.lead.textContent = variant.prompt.lead;
  elements.reasonLead.textContent = variant.prompt.reasonLead;
}

/**
 * Render the resolved site. Both buttons name a place ("reddit.com" /
 * "Wikipedia"), not a verdict ("Continue anyway"), so neither choice is
 * phrased more approvingly than the other.
 *
 * @param {object} resolved The GET_RESOLVED_SITE response.
 */
function render(resolved) {
  applyVariant(resolved.variant);
  elements.host.textContent = resolved.siteName;
  elements.goTarget.href = resolved.target;
  elements.goTargetLabel.textContent = resolved.targetName;
  elements.bypassLabel.textContent = resolved.siteName;
  elements.bypassMinutes.textContent = `${resolved.bypassMinutes} min`;
  if (resolved.reason) {
    elements.note.textContent = resolved.reason;
    elements.reason.hidden = false;
  }
  elements.notice.hidden = !resolved.showVariationNotice;
  if (resolved.overLimit) showOverLimit(elements.limit, resolved);
  if (resolved.degraded) {
    elements.status.textContent = 'Your settings could not be read, so defaults are shown. Open Settings for details.';
  }
}

/**
 * Mount the style's exercise. Every style shows the reason above it.
 *
 * @param {object} resolved
 * @param {() => void} onBreathsDone Runs after the last breath.
 */
function mountExercise(resolved, onBreathsDone) {
  if (resolved.pauseStyle === PauseStyle.BREATHING) {
    elements.exercise.hidden = false;
    mountBreathingView(elements.exercise, {
      breathCount: resolved.breathCount,
      onBreath: (done) => {
        gateState.breathsDone = done;
        if (done === resolved.breathCount) onBreathsDone();
      },
    });
  } else if (resolved.pauseStyle === PauseStyle.INTENTION) {
    elements.exercise.hidden = false;
    mountIntentionView(elements.exercise, {
      onInput: (text) => {
        gateState.intentionText = text;
      },
    });
  }
}

/** Re-evaluate the continue gate on a timer, from the moment of render. */
function startGate(resolved) {
  const startedAt = performance.now();
  const tick = () => {
    currentGate = continueGate({
      style: resolved.pauseStyle,
      pauseSeconds: resolved.pauseSeconds,
      elapsedMs: performance.now() - startedAt,
      breathsDone: gateState.breathsDone,
      breathCount: resolved.breathCount,
      intentionText: gateState.intentionText,
    });
    renderGate({ button: elements.bypass, gateLine: elements.gate }, currentGate);
  };
  tick();
  window.setInterval(tick, GATE_TICK_MS);
}

/** Auto-continue to the destination, recording it as steering clear. */
function autoContinue(resolved) {
  countdown = startCountdown(elements, {
    seconds: resolved.countdownSeconds,
    targetName: resolved.targetName,
    onArrive: () => viewEvent.then(recordSteered).finally(() => window.location.replace(resolved.target)),
  });
}

/**
 * Grant a bypass for the source host and go through to it.
 *
 * @param {string} sourceUrl
 */
async function handleBypass(sourceUrl) {
  if (!currentGate.enabled || elements.bypass.disabled) {
    return;
  }
  try {
    elements.bypass.disabled = true;
    elements.status.textContent = 'Opening…';
    // The worker rebuilds rules before answering, so once this resolves the
    // redirect rule is gone; no settle delay is needed.
    const eventId = await viewEvent;
    await sendMessage({ type: MessageType.GRANT_BYPASS, host: new URL(sourceUrl).hostname, eventId });
    window.location.replace(sourceUrl);
  } catch (error) {
    console.error('[steer-clear] handleBypass failed', { sourceUrl, error: error.message });
    elements.bypass.disabled = false;
    elements.status.textContent = `Could not continue: ${error.message}`;
  }
}

/**
 * Choosing the destination is recorded before leaving. A modified click
 * opens a new tab and leaves this page in place, so it is recorded without
 * holding the click back.
 *
 * @param {MouseEvent} event
 */
async function handleSteer(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    viewEvent.then(recordSteered);
    return;
  }
  event.preventDefault();
  await recordSteered(await viewEvent);
  window.location.assign(elements.goTarget.href);
}

async function dismissNotice() {
  elements.notice.hidden = true;
  try {
    await sendMessage({ type: MessageType.RECORD_LIFECYCLE_EVENT, event: LifecycleEvent.VARIATION_NOTICE_SEEN });
  } catch (error) {
    console.error('[steer-clear] could not record the variation notice as seen', { error: error.message });
  }
}

/** Show the "opened directly" state: nothing to steer clear of. */
function renderNoSource() {
  console.warn('[steer-clear] pause page has no usable source URL', { href: window.location.href });
  elements.host.textContent = 'Nothing to steer clear of';
  elements.goTarget.hidden = true;
  elements.continueGroup.hidden = true;
  elements.status.textContent = 'This page appears when you navigate to a site you have listed.';
}

async function init() {
  try {
    elements.openOptions.addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });

    const sourceUrl = extractSourceUrl(window.location.href);
    if (!sourceUrl) {
      renderNoSource();
      return;
    }

    const resolved = await sendMessage({ type: MessageType.GET_RESOLVED_SITE, fromUrl: sourceUrl });
    // When behavior surprises, the first question is "what did the page
    // receive"; this answers it without reading storage off disk.
    console.info('[steer-clear] pause page resolved', resolved);

    render(resolved);
    viewEvent = trackView(sourceUrl);
    elements.goTarget.addEventListener('click', handleSteer);
    elements.bypass.addEventListener('click', () => handleBypass(sourceUrl));
    elements.stop.addEventListener('click', () => countdown?.stop());
    document.addEventListener('keydown', (event) => event.key === STOP_COUNTDOWN_KEY && countdown?.stop());
    elements.noticeOk.addEventListener('click', dismissNotice);

    // With breathing, auto-continue waits for the last breath.
    const autoContinueAfterBreaths = resolved.autoContinue && resolved.pauseStyle === PauseStyle.BREATHING;
    mountExercise(resolved, () => {
      if (autoContinueAfterBreaths) autoContinue(resolved);
    });
    startGate(resolved);
    elements.goTarget.focus({ preventScroll: true });

    if (resolved.autoContinue && !autoContinueAfterBreaths) {
      autoContinue(resolved);
    }
  } catch (error) {
    console.error('[steer-clear] init failed', { error: error.message });
    elements.status.textContent = `Something went wrong: ${error.message}`;
  }
}

init();
