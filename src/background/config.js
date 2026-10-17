/**
 * Config storage I/O for Steer Clear.
 *
 * Single responsibility: moving config items in and out of storage.sync.
 * Assembly lives in sync_layout.js, mutations in config_mutations.js.
 *
 * Reading never writes — not on install, not after a migration. On a second
 * device, sync can install the extension before the synced data arrives; a
 * write at that moment would be the newest write and could replace the
 * user's settings everywhere.
 *
 * Writing happens only in the worker, one mutation at a time.
 */

import { assembleConfig, assertSyncQuota } from './sync_layout.js';
import { createSerialQueue } from './serial_queue.js';

/** Every config mutation runs through this, so each reads what the last wrote. */
const mutationQueue = createSerialQueue();

/**
 * @returns {Promise<object>} Every storage.sync item.
 */
export async function readSyncItems() {
  try {
    return await chrome.storage.sync.get(null);
  } catch (error) {
    console.error('[steer-clear] readSyncItems failed', { error: error.message });
    throw error;
  }
}

/**
 * Read the assembled config: `{ schemaVersion, defaults, sites, invalidSites }`.
 *
 * @returns {Promise<object>}
 * @throws {Error} If storage fails, a newer version wrote the settings, or
 *   the global settings are invalid.
 */
export async function readConfig() {
  try {
    return assembleConfig(await readSyncItems());
  } catch (error) {
    console.error('[steer-clear] readConfig failed', { error: error.message });
    throw error;
  }
}

/**
 * Write one planned mutation: quota check, then one remove and one set.
 * Only the worker's mutation queue (mutateConfig) calls this.
 *
 * The removal goes first. The browser checks its total quota at the set,
 * while the items being replaced are still stored, so set-then-remove would
 * refuse a replacement (an import from another browser) whose final state
 * fits. If the set then fails, the removed items are written back, so a
 * failed mutation leaves the settings as they were.
 *
 * @param {{set: object, remove: string[]}} plan
 * @param {object} currentItems The items the plan was made from.
 * @returns {Promise<void>}
 * @throws {Error} On a quota violation, before anything is written; or when
 *   a write fails, after the removed items were restored. A failed restore
 *   says so.
 */
export async function applyMutation(plan, currentItems) {
  assertSyncQuota(plan.set, currentItems, plan.remove);
  const removed = Object.fromEntries(
    plan.remove.filter((key) => key in currentItems).map((key) => [key, currentItems[key]])
  );
  if (plan.remove.length > 0) {
    await chrome.storage.sync.remove(plan.remove);
  }
  if (Object.keys(plan.set).length === 0) return;
  try {
    await chrome.storage.sync.set(plan.set);
  } catch (error) {
    if (Object.keys(removed).length === 0) throw error;
    try {
      await chrome.storage.sync.set(removed);
    } catch (restoreError) {
      throw new Error(
        `[steer-clear] writing the settings failed (${error.message}) after ${plan.remove.join(', ')} ` +
          `were removed, and restoring them also failed (${restoreError.message})`
      );
    }
    throw new Error(`[steer-clear] writing the settings failed (${error.message}); the removed items were restored`);
  }
}

/**
 * Plan and apply one mutation against freshly read items, serialized with
 * every other mutation.
 *
 * @param {string} name Mutation name, for logs.
 * @param {(items: object) => ({set: object, remove: string[]}|{plan: object})} planner
 *   Returns a plan, or a result object carrying one in `plan`.
 * @returns {Promise<object>} The planner's result.
 */
export function mutateConfig(name, planner) {
  return mutationQueue.run(async () => {
    try {
      const items = await readSyncItems();
      const result = planner(items);
      const plan = result.plan ?? result;
      await applyMutation(plan, items);
      console.info('[steer-clear] config mutation applied', {
        name,
        set: Object.keys(plan.set),
        removed: plan.remove,
      });
      return result;
    } catch (error) {
      console.error('[steer-clear] config mutation failed', { name, error: error.message });
      throw error;
    }
  });
}
