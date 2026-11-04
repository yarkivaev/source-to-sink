import pollingSource from './pollingSource.js';
import positive from './positive.js';

function config(options) {
  const settings = { requestTimeoutMs: 5000, maxResponseBytes: 1048576, pageLimit: 1000, queryLagMs: 1000, ...options };
  ['requestTimeoutMs', 'maxResponseBytes', 'pageLimit'].forEach((key) => { positive(settings[key], key); });
  if (!Number.isSafeInteger(settings.pageLimit) || settings.pageLimit > 10000 || !Number.isSafeInteger(settings.maxResponseBytes)) {
    throw new TypeError('Invalid Loki response capacity');
  }
  if (!Number.isSafeInteger(settings.queryLagMs) || settings.queryLagMs < 0) { throw new TypeError('Invalid Loki queryLagMs'); }
  return settings;
}
async function body(response, maxBytes) {
  if (!response.ok) { throw new Error(`Loki HTTP status ${response.status}`); }
  if (!response.body) { throw new Error('Loki response body missing'); }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) { throw new Error('Loki response capacity exceeded'); }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, bytes).toString());
}
function entries(data, limit) {
  if (data.status !== 'success' || !Array.isArray(data.data?.result) || data.data.resultType !== 'streams') {
    throw new Error('Invalid Loki stream response');
  }
  const rows = data.data.result.flatMap((stream) => {
    if (!Array.isArray(stream.values)) { throw new Error('Invalid Loki stream values'); }
    return stream.values;
  });
  // A full page may hide older/equal-timestamp rows. Do not deliver or advance a partial window.
  if (rows.length >= limit) { throw new Error('Loki query page saturated; history incomplete, cursor unchanged'); }
  return rows.map(([ts, line]) => {
    if (typeof ts !== 'string' || !/^\d+$/u.test(ts) || typeof line !== 'string') { throw new Error('Invalid Loki log entry'); }
    return { ts: Number(ts) / 1000000, line };
  });
}
function requestUrl(url, query, range, limit) {
  const params = new URLSearchParams({ query, start: (range.since * 1000000).toString(),
    end: (range.until * 1000000).toString(), limit: String(limit), direction: 'forward' });
  return `${url}/loki/api/v1/query_range?${params}`;
}
async function request(url, settings, signal) {
  const controller = new AbortController();
  function abort() { controller.abort(signal.reason); }
  if (signal?.aborted) { abort(); }
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { controller.abort(new Error('Loki request deadline exceeded')); }, settings.requestTimeoutMs);
  try {
    const response = await globalThis.fetch(url, { signal: controller.signal });
    return entries(await body(response, settings.maxResponseBytes), settings.pageLimit);
  } catch (error) {
    controller.abort(error);
    try { settings.onError?.(error); } catch {
      // Diagnostics cannot suppress the failed read or change its cursor.
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
/**
 * Bounded Loki polling. Saturated pages fail without advancing the in-memory cursor.
 * Windows lag wall-clock time by queryLagMs (default 1s) to allow ingestion visibility.
 * Entries becoming visible later than this configured lag may still be missed.
 * This live polling source does not expose portable history checkpoints or pagination.
 *
 * @param {string} url - Loki base URL
 * @param {string} query - LogQL expression
 * @param {number} interval - Polling interval in seconds
 * @param {object} collector - Collector with accept()
 * @param {object} clk - Clock with millis()
 * @param {object} options - requestTimeoutMs, maxResponseBytes, pageLimit, queryLagMs, onError
 * @returns {object} Source with async start/stop
 */
// Sixth optional argument preserves the established five-argument source API.
// eslint-disable-next-line max-params
export default function lokiSource(url, query, interval, collector, clk, options = {}) {
  if (typeof url !== 'string' || url.length === 0) { throw new Error('URL must be a non-empty string'); }
  if (typeof query !== 'string' || query.length === 0) { throw new Error('Query must be a non-empty string'); }
  const settings = config(options);
  return pollingSource((since, until, { signal } = {}) => {
    return request(requestUrl(url, query, { since: since - settings.queryLagMs, until: until - settings.queryLagMs }, settings.pageLimit), settings, signal);
  }, interval, collector, clk);
}
