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
  goTarget: document.getElementById('go-target'),
  bypass: document.getElementById('bypass'),
  status: document.getElementById('status'),
  openOptions: document.getElementById('open-options'),
};

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
 * @param {{host: string, target: string, note: string}} resolved
 */
function render(resolved) {
  elements.host.textContent = resolved.host;
  elements.goTarget.href = resolved.target;

  if (resolved.note) {
    elements.note.textContent = resolved.note;
    elements.note.hidden = false;
  }
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
      elements.bypass.hidden = true;
      elements.goTarget.hidden = true;
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
  } catch (error) {
    console.error('[steer-clear] init failed', { error: error.message });
    elements.status.textContent = `Something went wrong: ${error.message}`;
  }
}

init();
