/**
 * An in-memory stand-in for the parts of `chrome.*` the worker uses, so the
 * message handlers can be tested end to end in Node.
 *
 * Not a test file itself: it lives under helpers/, outside the
 * `tests/unit/*.js` glob.
 */

/**
 * @param {object} store Backing object, mutated in place.
 * @returns {object} A storage area with get/set/remove.
 */
function storageArea(store) {
  return {
    store,
    async get(keys) {
      if (keys === null || keys === undefined) return structuredClone(store);
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((key) => key in store).map((key) => [key, structuredClone(store[key])]));
    },
    async set(items) {
      Object.assign(store, structuredClone(items));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
    },
  };
}

/**
 * @param {{sync?: object, local?: object, session?: object,
 *   tabs?: Array<{id: number, url: string}>, badge?: boolean}} [initial]
 *   `badge: false` simulates a browser without a toolbar badge.
 * @returns {{chrome: object, calls: object}}
 */
export function createFakeChrome({ sync = {}, local = {}, session = {}, tabs = [], badge = true } = {}) {
  const calls = {
    badges: [],
    tabUpdates: [],
    tabCreates: [],
    alarms: {},
    clearedAlarms: [],
    dynamicRules: [],
    syncSets: [],
    syncRemoves: [],
  };
  const syncArea = storageArea(sync);
  const originalSet = syncArea.set;
  syncArea.set = async (items) => {
    calls.syncSets.push(Object.keys(items));
    return originalSet(items);
  };
  const originalRemove = syncArea.remove;
  syncArea.remove = async (keys) => {
    calls.syncRemoves.push(keys);
    return originalRemove(keys);
  };

  const localArea = storageArea(local);
  const originalLocalSet = localArea.set;
  calls.localSets = [];
  localArea.set = async (items) => {
    calls.localSets.push(Object.keys(items));
    return originalLocalSet(items);
  };

  const chrome = {
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    storage: { sync: syncArea, local: localArea, session: storageArea(session) },
    permissions: { contains: async () => true },
    declarativeNetRequest: {
      getDynamicRules: async () => structuredClone(calls.dynamicRules),
      // Removes first, then adds, as the real API does; an id that is both
      // removed and added is replaced.
      updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => {
        const added = new Set(addRules.map((rule) => rule.id));
        const kept = calls.dynamicRules.filter((rule) => !removeRuleIds.includes(rule.id));
        if (kept.some((rule) => added.has(rule.id))) {
          throw new Error('updateDynamicRules: a rule with this id already exists');
        }
        calls.dynamicRules = [...kept, ...structuredClone(addRules)];
      },
    },
    alarms: {
      create: async (name, info) => {
        calls.alarms[name] = info;
      },
      clear: async (name) => {
        calls.clearedAlarms.push(name);
        delete calls.alarms[name];
      },
    },
    tabs: {
      // The real query filters by URL; the code under test filters again
      // with the redirect's own matching, so returning every tab exercises
      // that filter.
      query: async () => structuredClone(tabs),
      update: async (tabId, props) => {
        calls.tabUpdates.push({ tabId, ...props });
      },
      create: async (props) => {
        calls.tabCreates.push(props);
        return { id: 1000 + calls.tabCreates.length, ...props };
      },
    },
    action: badge
      ? {
          setBadgeText: async ({ tabId, text }) => {
            calls.badges.push({ tabId, text });
          },
          setBadgeBackgroundColor: async () => {},
        }
      : {},
  };
  return { chrome, calls };
}
