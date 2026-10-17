/**
 * Onboarding's "Turn on Steer Clear": every picked site in one ADD_SITES
 * write, then one permission prompt for all of them, in the same tick.
 *
 * Kept free of the DOM so the call order is unit-tested.
 */

import { LifecycleEvent, MessageType } from '../constants.js';
import { normalizeOnboardingSelection } from '../background/presets.js';
import { addSitesThenRequestAccess } from '../shared/site_access.js';
import { sendWithoutAwait } from '../shared/messaging.js';

/**
 * The "Turn on" click handler.
 *
 * @param {{chips: string[], typedHosts: string[], reasons: Object<string, string>}} selection
 *   `reasons` maps a normalized host to its optional reason.
 * @returns {{hosts: string[], granted: Promise<boolean>}}
 * @throws {Error} Synchronously, when nothing is picked; nothing is sent.
 */
export function turnOn({ chips, typedHosts, reasons }) {
  const hosts = normalizeOnboardingSelection(chips, typedHosts);
  if (hosts.length === 0) {
    throw new Error('Pick at least one site first.');
  }
  const entries = hosts.map((host) => ({ host, reason: (reasons[host] ?? '').trim() }));
  const granted = addSitesThenRequestAccess(entries);
  sendWithoutAwait({ type: MessageType.RECORD_LIFECYCLE_EVENT, event: LifecycleEvent.ONBOARDING_COMPLETED });
  return { hosts, granted };
}
