/**
 * Steer Clear interstitial controller.
 *
 * Reads the originally-requested URL from the query string, asks the service
 * worker to resolve the effective target and note, and wires the two actions.
 * Never touches declarativeNetRequest directly — the worker owns rules.
 */

import { MessageType, PARAM_FROM } from '../constants.js';

const elements = {
  host: document.getElementById('host'),
  note: document.getElementById('note'),
  actions: document.getElementById('actions'),
  goTarget: document.getElementById('go-target'),
  goTargetLabel: document.getElementById('go-target-label'),
  bypass: document.getElementById('bypass'),
  bypassLabel: document.getElementById('bypass-label'),
  countdown: document.getElementById('countdown'),
  countdownTarget: document.getElementById('countdown-target'),
  countdownSeconds: document.getElementById('countdown-seconds'),
  stop: document.getElementById('stop'),
  status: document.getElementById('status'),
  openOptions: document.getElementById('open-options'),
};

/** Handle for the auto-continue interval, so Stop can cancel it. */
let countdownTimer = null;

/**
 * Extract the originally-requested URL from this page's query string.
 *
 * @returns {string|null} The source URL, or null if absent/malformed.
 */
function readSourceUrl() {
  try {
    const raw = new URL(window.location.href).searchParams.get(PARAM_FROM);
    if (!raw) {
      return null;
    }
    // Validate before trusting it anywhere.
    new URL(raw);
    return raw;
  } catch (error) {
    console.error('[steer-clear] readSourceUrl failed', {
      href: window.location.href,
      error: error.message,
    });
    return null;
  }
}

/**
 * Send a message to the service worker, rejecting on a non-ok response.
 *
 * @param {object} message
 * @returns {Promise<object>} The response payload.
 */
async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? 'no response from service worker');
  }
  return response;
}

/**
 * Render the resolved site details into the page.
 *
 * Both buttons name their destination rather than describing the choice
 * ("ynet" / "Wikipedia", not "Continue anyway" / "Go where I meant to"), so
 * neither option is phrased more approvingly than the other. The user picks a
 * place to go, not a verdict on their own behavior.
 *
 * @param {{host: string, siteName: string, target: string, targetName: string,
 *   note: string}} resolved
 */
function render(resolved) {
  elements.host.textContent = resolved.siteName;
  elements.goTarget.href = resolved.target;
  elements.goTargetLabel.textContent = resolved.targetName;
  elements.bypassLabel.textContent = resolved.siteName;

  if (resolved.note) {
    elements.note.textContent = resolved.note;
    elements.note.hidden = false;
  }
}

/**
 * Run the auto-continue countdown, navigating to the target when it elapses.
 *
 * The screen still appears — the point is that the reflex becomes visible —
 * but proceeding is the default and stopping is the deliberate act. This
 * inverts the normal interstitial without making the redirect invisible.
 *
 * @param {{target: string, targetName: string, countdownSeconds: number}} resolved
 */
function startCountdown(resolved) {
  let remaining = resolved.countdownSeconds;

  elements.countdownTarget.textContent = resolved.targetName;
  elements.countdownSeconds.textContent = `${remaining}s`;
  elements.countdown.hidden = false;
  elements.actions.hidden = true;

  countdownTimer = window.setInterval(() => {
    remaining -= 1;

    if (remaining > 0) {
      elements.countdownSeconds.textContent = `${remaining}s`;
      return;
    }

    window.clearInterval(countdownTimer);
    countdownTimer = null;
    window.location.replace(resolved.target);
  }, 1000);
}

/**
 * Cancel the countdown and fall back to the deliberate two-button choice.
 *
 * Stopping means "wait, let me think" rather than "take me to the site" — a
 * reflexive click must not commit the user to the destination they were trying
 * to avoid.
 */
function cancelCountdown() {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  elements.countdown.hidden = true;
  elements.actions.hidden = false;
  elements.status.textContent = 'Stopped. Your call.';
}

/**
 * Grant a bypass for the source host and navigate through to it.
 *
 * @param {string} sourceUrl The originally-requested URL.
 */
async function handleBypass(sourceUrl) {
  try {
    elements.bypass.disabled = true;
    elements.status.textContent = 'Opening…';

    const host = new URL(sourceUrl).hostname;
    await sendMessage({ type: MessageType.GRANT_BYPASS, host });

    // The rule is removed asynchronously; a short settle avoids racing the
    // rebuild and bouncing straight back to this page.
    window.setTimeout(() => {
      window.location.replace(sourceUrl);
    }, 150);
  } catch (error) {
    console.error('[steer-clear] handleBypass failed', {
      sourceUrl,
      error: error.message,
    });
    elements.bypass.disabled = false;
    elements.status.textContent = `Could not continue: ${error.message}`;
  }
}

/** Initialize the page. */
async function init() {
  try {
    elements.openOptions.addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });

    const sourceUrl = readSourceUrl();

    if (!sourceUrl) {
      // Reached without a source URL — someone opened the page directly.
      elements.host.textContent = 'Nothing to steer clear of';
      elements.actions.hidden = true;
      elements.status.textContent =
        'This page appears when you navigate to a site you have blocked.';
      return;
    }

    const resolved = await sendMessage({
      type: MessageType.GET_RESOLVED_SITE,
      fromUrl: sourceUrl,
    });

    render(resolved);

    elements.bypass.addEventListener('click', () => {
      handleBypass(sourceUrl);
    });

    elements.stop.addEventListener('click', cancelCountdown);

    if (resolved.autoContinue) {
      startCountdown(resolved);
    }
  } catch (error) {
    console.error('[steer-clear] init failed', { error: error.message });
    elements.status.textContent = `Something went wrong: ${error.message}`;
  }
}

init();
