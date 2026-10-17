/**
 * Run async tasks one at a time, in the order they were queued.
 *
 * The worker's config mutations each read, plan and write. Interleaving two
 * of them would let the second plan from a read the first is about to make
 * stale, so they queue.
 */

/**
 * @returns {{run: <T>(task: () => Promise<T>) => Promise<T>}}
 */
export function createSerialQueue() {
  let tail = Promise.resolve();
  return {
    run(task) {
      const result = tail.then(task);
      // The next task waits for this one whether it succeeds or fails; the
      // failure itself still reaches this task's caller through `result`.
      tail = result.catch(() => {});
      return result;
    },
  };
}
