/**
 * Persistence for the lifecycle flags in storage.local.
 *
 * Single responsibility: moving `lifecycle` in and out of storage. The shape
 * and transitions live in lifecycle.js.
 */

import { StorageKey } from '../constants.js';
import { applyLifecycleEvent, normalizeLifecycle } from './lifecycle.js';

/**
 * @returns {Promise<object>} The normalized lifecycle.
 */
export async function readLifecycle() {
  try {
    const stored = await chrome.storage.local.get(StorageKey.LIFECYCLE);
    return normalizeLifecycle(stored[StorageKey.LIFECYCLE]);
  } catch (error) {
    console.error('[steer-clear] readLifecycle failed', { error: error.message });
    throw error;
  }
}

/**
 * Apply one lifecycle event and persist the result.
 *
 * @param {string} event A LifecycleEvent value.
 * @param {number} now Epoch ms.
 * @returns {Promise<object>} The updated lifecycle.
 */
export async function recordLifecycleEvent(event, now) {
  try {
    const lifecycle = applyLifecycleEvent(await readLifecycle(), event, now);
    await chrome.storage.local.set({ [StorageKey.LIFECYCLE]: lifecycle });
    console.info('[steer-clear] lifecycle event recorded', { event });
    return lifecycle;
  } catch (error) {
    console.error('[steer-clear] recordLifecycleEvent failed', { event, error: error.message });
    throw error;
  }
}
