/**
 * Host-permission handling for Steer Clear.
 *
 * Redirecting a request requires host permission for that request's URL.
 * Rather than asking for every site up front — which reads as
 * "read and change all your data on all websites" and is the permission
 * profile of a traffic hijacker — the extension requests access to each host
 * at the moment the user adds it.
 *
 * Single responsibility: translating between hostnames and Chrome's
 * permission API. No rule building, no storage, no UI.
 */

/**
 * The match patterns needed to redirect navigations to a host.
 *
 * Both schemes are requested together: a user who types "ynet.co.il" means the
 * site, not one protocol, and being prompted twice for the same site would be
 * incoherent. Subdomains are always included in the request because a user can
 * toggle `includeSubdomains` on later, and re-prompting at that point would
 * interrupt a settings change.
 *
 * @param {string} host A normalized bare hostname.
 * @returns {string[]} Match patterns for chrome.permissions.
 */
export function originPatternsFor(host) {
  if (typeof host !== 'string' || host.trim() === '') {
    throw new Error(`originPatternsFor: expected a hostname, got "${host}"`);
  }
  return [`https://*.${host}/*`, `http://*.${host}/*`, `https://${host}/*`, `http://${host}/*`];
}

/**
 * Whether the extension currently holds permission for a host.
 *
 * @param {string} host A normalized bare hostname.
 * @returns {Promise<boolean>}
 */
export async function hasHostPermission(host) {
  try {
    return await chrome.permissions.contains({
      origins: originPatternsFor(host),
    });
  } catch (error) {
    console.error('[steer-clear] hasHostPermission failed', {
      host,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Request permission for a host.
 *
 * Must be called from a user gesture — Chrome rejects the prompt otherwise,
 * which is why this lives behind a click in the options page and is never
 * called from the service worker.
 *
 * @param {string} host A normalized bare hostname.
 * @returns {Promise<boolean>} Whether permission was granted.
 */
export async function requestHostPermission(host) {
  try {
    const granted = await chrome.permissions.request({
      origins: originPatternsFor(host),
    });
    console.info('[steer-clear] host permission request', { host, granted });
    return granted;
  } catch (error) {
    console.error('[steer-clear] requestHostPermission failed', {
      host,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Revoke permission for a host, so removing a site also gives back its access.
 *
 * Failure here is logged but not thrown: the user's intent was to remove the
 * site, and a stuck permission should not block that.
 *
 * @param {string} host A normalized bare hostname.
 * @returns {Promise<void>}
 */
export async function revokeHostPermission(host) {
  try {
    await chrome.permissions.remove({ origins: originPatternsFor(host) });
    console.info('[steer-clear] host permission revoked', { host });
  } catch (error) {
    console.warn('[steer-clear] revokeHostPermission failed; continuing', {
      host,
      error: error.message,
    });
  }
}

/**
 * The subset of the given hosts the extension can currently act on.
 *
 * @param {string[]} hosts Normalized bare hostnames.
 * @returns {Promise<Set<string>>} Those with permission granted.
 */
export async function grantedHostsAmong(hosts) {
  try {
    const results = await Promise.all(
      hosts.map(async (host) => [host, await hasHostPermission(host)])
    );
    return new Set(
      results.filter(([, granted]) => granted).map(([host]) => host)
    );
  } catch (error) {
    console.error('[steer-clear] grantedHostsAmong failed', {
      error: error.message,
    });
    throw error;
  }
}
