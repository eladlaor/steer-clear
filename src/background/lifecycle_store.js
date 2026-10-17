/**
 * Persistence for the lifecycle flags in storage.local.
 *
 * Pages may read the flags (reading has no side effects); only the worker
 * writes them, in answer to RECORD_LIFECYCLE_EVENT.
 *
 * Single responsibility: moving `lifecycle` in and out of storage. The shape
 * and transitions live in lifecycle.js.
 */

import { StorageKey } from '../constants.js';
import { applyLifecycleEvent, normalizeLifecycle } from './lifecycle.js';
import { createSerialQueue } from './serial_queue.js';

/**
 * Each event reads, applies and writes. A rating answer from the popup and
 * the pause page's notice arriving together would otherwise both read the
 * old record and one would be lost, so writes queue.
 */
const lifecycleQueue = createSerialQueue();

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
export function recordLifecycleEvent(event, now) {
  return lifecycleQueue.run(async () => {
    try {
      const lifecycle = applyLifecycleEvent(await readLifecycle(), event, now);
      await chrome.storage.local.set({ [StorageKey.LIFECYCLE]: lifecycle });
      console.info('[steer-clear] lifecycle event recorded', { event });
      return lifecycle;
    } catch (error) {
      console.error('[steer-clear] recordLifecycleEvent failed', { event, error: error.message });
      throw error;
    }
  });
}
