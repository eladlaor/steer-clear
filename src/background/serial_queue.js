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

/**
 * Wrap a task so calls made while one run of it is still waiting in the
 * queue share that run instead of queueing another.
 *
 * For tasks that re-derive state from storage (the rule rebuild): a run that
 * has not started yet will read whatever the later callers wanted it to see,
 * so one run serves them all. A run that has already started does not absorb
 * later calls, since it may have read before their change.
 *
 * @param {{run: Function}} queue From createSerialQueue.
 * @param {() => Promise<T>} task
 * @returns {() => Promise<T>}
 * @template T
 */
export function createCoalescedTask(queue, task) {
  let waiting = null;
  return () => {
    if (waiting) return waiting;
    const run = queue.run(() => {
      waiting = null;
      return task();
    });
    waiting = run;
    return run;
  };
}
