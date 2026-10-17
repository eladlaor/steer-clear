/**
 * Messages from extension pages to the service worker.
 *
 * The worker answers every message with `{ ok: true, ... }` or
 * `{ ok: false, error }`; these helpers turn that envelope into a resolved
 * value or a thrown error, so pages never branch on `ok` themselves.
 */

/**
 * Send a message and resolve with the worker's response.
 *
 * @param {{type: string}} message
 * @returns {Promise<object>} The response payload.
 * @throws When the worker reports a failure or does not answer.
 */
export async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? `no response from service worker for ${message?.type}`);
  }
  return response;
}

/**
 * Send a message without waiting for it, logging any failure.
 *
 * For click handlers that must call `chrome.permissions.request` next: Firefox
 * drops the user gesture at the first `await`, and may close a popup as soon
 * as the prompt opens, so the message has to leave first and nothing may
 * depend on its answer. The send starts synchronously, before this returns.
 *
 * @param {{type: string}} message
 * @returns {void}
 */
export function sendWithoutAwait(message) {
  sendMessage(message).catch((error) => {
    console.error('[steer-clear] sendWithoutAwait failed', {
      type: message?.type,
      error: error.message,
    });
  });
}
