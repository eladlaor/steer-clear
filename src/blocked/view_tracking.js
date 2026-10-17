/**
 * One recorded event per pause-page view, and the user's choice on it.
 *
 * The view id lives in history.state, so a reload or a restored session
 * keeps it and the worker does not count the view twice. The view is
 * reported only once the page is visible: a page the browser prerenders
 * while the user is still typing an address waits, and logs nothing if it is
 * never shown.
 *
 * Recording is a side observation: a failure is logged and the page keeps
 * working.
 */

import { MessageType, Outcome } from '../constants.js';
import { sendMessage } from '../shared/messaging.js';

const VISIBLE = 'visible';

/** @returns {Promise<void>} Resolves once the page is visible to the user. */
function whenVisible() {
  if (document.visibilityState === VISIBLE) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== VISIBLE) return;
      document.removeEventListener('visibilitychange', onChange);
      resolve();
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

/**
 * This view's id: the one in history.state, or a new one stored there.
 *
 * @returns {string}
 */
function currentViewId() {
  const state = history.state ?? {};
  if (typeof state.viewId === 'string' && state.viewId !== '') {
    return state.viewId;
  }
  const viewId = crypto.randomUUID();
  history.replaceState({ ...state, viewId }, '');
  return viewId;
}

/**
 * Report this view once the page is visible.
 *
 * When the worker counts it under an earlier event (a retyped address within
 * a minute), that event's id replaces the view id in history.state, so a
 * later reload of this page is recognized as the same view.
 *
 * @param {string} fromUrl The originally-requested URL.
 * @returns {Promise<string|null>} The event id to report outcomes against,
 *   or null when the view was not recorded.
 */
export async function trackView(fromUrl) {
  await whenVisible();
  const viewId = currentViewId();
  try {
    const { eventId } = await sendMessage({ type: MessageType.RECORD_VIEW, viewId, fromUrl });
    if (eventId && eventId !== viewId) {
      history.replaceState({ ...history.state, viewId: eventId }, '');
    }
    return eventId;
  } catch (error) {
    console.error('[steer-clear] could not record this view; continuing', { error: error.message });
    return null;
  }
}

/**
 * Record that the user chose the destination.
 *
 * @param {string|null} eventId From trackView.
 * @returns {Promise<void>}
 */
export async function recordSteered(eventId) {
  if (!eventId) {
    console.info('[steer-clear] steered clear of a view that was not recorded; not counted');
    return;
  }
  try {
    await sendMessage({ type: MessageType.RECORD_OUTCOME, eventId, outcome: Outcome.STEERED });
  } catch (error) {
    console.error('[steer-clear] could not record steering clear; continuing', { eventId, error: error.message });
  }
}
