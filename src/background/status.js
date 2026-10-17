/**
 * The popup's status line (GET_STATUS): whether reminders are snoozed, and
 * whether the saved settings can be read.
 *
 * A settings error is reported, not thrown: the popup must still open and
 * offer "Resume now" and the link to settings, where the error is explained.
 */

import { StorageKey } from '../constants.js';
import { readConfig } from './config.js';
import { activeSnoozeUntil } from './snooze.js';

/**
 * @returns {Promise<string|null>} Why the settings cannot be read, or null.
 */
async function configErrorMessage() {
  try {
    await readConfig();
    return null;
  } catch (error) {
    console.error('[steer-clear] status: settings unreadable', { error: error.message });
    return error.message;
  }
}

/**
 * @param {number} now Epoch ms.
 * @returns {Promise<{snoozedUntil: number|null, configError: string|null}>}
 */
export async function readStatus(now) {
  try {
    const stored = await chrome.storage.session.get(StorageKey.SNOOZE);
    return {
      snoozedUntil: activeSnoozeUntil(stored[StorageKey.SNOOZE], now),
      configError: await configErrorMessage(),
    };
  } catch (error) {
    console.error('[steer-clear] readStatus failed', { error: error.message });
    throw error;
  }
}
