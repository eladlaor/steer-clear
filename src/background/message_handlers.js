/**
 * The worker's message dispatch table. Every page talks to the worker only
 * through these messages; config changes in particular are never written by
 * a page directly.
 */

import { MessageType } from '../constants.js';
import { mutateConfig } from './config.js';
import {
  planAddSites,
  planRemoveSite,
  planUpdateDefaults,
  planUpdateSite,
} from './config_mutations.js';
import { recordLifecycleEvent } from './lifecycle_store.js';
import { getResolvedSite } from './resolved_site.js';
import {
  assertOptionalEventId,
  recordContinued,
  recordPauseView,
  recordSteered,
} from './pause_views.js';
import { grantBypass, rebuildRules } from './rule_sync.js';
import { clearStats, readStats } from './stats_store.js';

/** Handlers by message type. Each returns the response payload. */
const HANDLERS = Object.freeze({
  [MessageType.GET_RESOLVED_SITE]: (message) => getResolvedSite(message.fromUrl),

  [MessageType.RECORD_VIEW]: async (message) => ({
    eventId: await recordPauseView(message.viewId, message.fromUrl),
  }),

  [MessageType.RECORD_OUTCOME]: async (message) => {
    await recordSteered(message.eventId, message.outcome);
    return {};
  },

  // Never refused for the daily allowance: the allowance only lengthens the
  // wait on the page. The continue is counted once the bypass is in place.
  [MessageType.GRANT_BYPASS]: async (message, sender) => {
    assertOptionalEventId(message.eventId);
    const result = await grantBypass(message.host, sender?.tab?.id);
    await recordContinued(message.eventId);
    return result;
  },

  [MessageType.RECORD_LIFECYCLE_EVENT]: async (message) => ({
    lifecycle: await recordLifecycleEvent(message.event, Date.now()),
  }),

  [MessageType.GET_STATS]: async () => ({ stats: await readStats() }),

  [MessageType.CLEAR_STATS]: async () => {
    await clearStats();
    return {};
  },

  // Granting a permission is not a storage change, so a page that just got
  // access asks for a rebuild explicitly.
  [MessageType.REBUILD_RULES]: async () => {
    await rebuildRules();
    return {};
  },

  [MessageType.ADD_SITES]: async (message) => {
    const { added, skipped } = await mutateConfig(MessageType.ADD_SITES, (items) =>
      planAddSites(items, message, { newId: () => crypto.randomUUID(), now: Date.now() })
    );
    return { added, skipped };
  },

  [MessageType.UPDATE_SITE]: async (message) => {
    await mutateConfig(MessageType.UPDATE_SITE, (items) => planUpdateSite(items, message));
    return {};
  },

  [MessageType.REMOVE_SITE]: async (message) => {
    await mutateConfig(MessageType.REMOVE_SITE, (items) => planRemoveSite(items, message));
    return {};
  },

  [MessageType.UPDATE_DEFAULTS]: async (message) => {
    await mutateConfig(MessageType.UPDATE_DEFAULTS, (items) => planUpdateDefaults(items, message));
    return {};
  },
});

/**
 * Handle one runtime message.
 *
 * @param {{type: string}} message
 * @param {object} [sender] The runtime.onMessage sender.
 * @returns {Promise<object>} The response payload (without `ok`).
 * @throws {Error} On an unknown type or a failed handler.
 */
export async function handleMessage(message, sender) {
  const handler = HANDLERS[message?.type];
  if (!handler) {
    throw new Error(`unknown message type: ${message?.type}`);
  }
  return handler(message, sender);
}
