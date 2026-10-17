/**
 * The one-time rating banner, on the two pages a user opens themselves: the
 * toolbar popup and the statistics page.
 *
 * Shown at most once per page open, only when shouldShowRatingPrompt says so.
 * The page reads the lifecycle flags itself (reading has no side effects);
 * every change is a RECORD_LIFECYCLE_EVENT for the worker to write.
 */

import { LifecycleEvent, MessageType } from '../constants.js';
import { readLifecycle } from '../background/lifecycle_store.js';
import { shouldShowRatingPrompt, storeReviewUrl } from '../background/rating.js';
import { steerCount } from '../background/progress.js';
import { detectBrowser } from './platform.js';
import { sendWithoutAwait } from './messaging.js';

/** @param {string} event A LifecycleEvent value. */
const record = (event) => sendWithoutAwait({ type: MessageType.RECORD_LIFECYCLE_EVENT, event });

/**
 * @returns {string|null} This browser's store reviews page, or null.
 */
function currentStoreUrl() {
  const browser = detectBrowser({
    extensionBaseUrl: chrome.runtime.getURL(''),
    uaBrands: navigator.userAgentData?.brands,
  });
  const url = storeReviewUrl(browser);
  if (url === null) {
    console.info('[steer-clear] no store reviews page for this browser; rating prompt hidden', { browser });
  }
  return url;
}

/**
 * Build the banner's markup.
 *
 * @param {number} steers How many times the user chose the destination.
 * @param {string} storeUrl
 * @returns {{root: HTMLElement, rate: HTMLAnchorElement, dismiss: HTMLButtonElement}}
 */
function buildBanner(steers, storeUrl) {
  const root = document.createElement('aside');
  root.className = 'rating';
  root.setAttribute('aria-labelledby', 'rating-text');

  const text = document.createElement('p');
  text.className = 'rating-text';
  text.id = 'rating-text';
  // Worded by what it counts (choosing the destination), so it never
  // disagrees with the "steered clear" figures, which also count leaving.
  text.textContent = `You've picked your destination over a listed site ${steers} ${steers === 1 ? 'time' : 'times'}. If Steer Clear is helping, a rating helps others find it.`;

  const rate = document.createElement('a');
  rate.className = 'btn btn-primary btn-small';
  rate.href = storeUrl;
  rate.target = '_blank';
  rate.rel = 'noopener';
  rate.textContent = 'Rate Steer Clear';

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn btn-ghost btn-small';
  dismiss.textContent = 'No thanks';

  const actions = document.createElement('div');
  actions.className = 'rating-actions';
  actions.append(rate, dismiss);
  root.append(text, actions);
  return { root, rate, dismiss };
}

/**
 * Show the banner in a container when it is due, and record the showing.
 *
 * @param {HTMLElement} container Empty element the banner goes in.
 * @param {object} stats A normalized stats record.
 * @returns {Promise<boolean>} Whether the banner was shown.
 */
export async function mountRatingBanner(container, stats) {
  try {
    const storeUrl = currentStoreUrl();
    const steers = steerCount(stats);
    if (!shouldShowRatingPrompt(await readLifecycle(), steers, storeUrl)) return false;

    const banner = buildBanner(steers, storeUrl);
    // Hidden rather than removed: a link taken out of the document during
    // its own click is not followed in every browser, and "Rate" must still
    // open the store.
    const close = (event) => {
      record(event);
      container.hidden = true;
    };
    // The link opens the store in a new tab by itself; the answer is sent
    // first, since a popup may close as the tab opens.
    banner.rate.addEventListener('click', () => close(LifecycleEvent.RATING_RATED));
    banner.dismiss.addEventListener('click', () => close(LifecycleEvent.RATING_DISMISSED));

    container.replaceChildren(banner.root);
    record(LifecycleEvent.RATING_SHOWN);
    return true;
  } catch (error) {
    // The banner is optional; the page around it must keep working.
    console.error('[steer-clear] rating banner failed; not shown', { error: error.message });
    return false;
  }
}
