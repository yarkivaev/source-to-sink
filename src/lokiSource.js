import pollingSource from './pollingSource.js';

/**
 * Loki polling source for streaming log entries to a collector.
 *
 * Polls Loki at a specified interval and forwards log entries
 * to the collector. Creates HTTP client internally.
 *
 * @example
 * const source = lokiSource('http://localhost:3100', '{app="traefik"}', 10, collector, clock);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {string} url - Loki base URL (e.g., 'http://localhost:3100')
 * @param {string} query - LogQL query string
 * @param {number} interval - Polling interval in seconds
 * @param {object} collector - Collector with accept() method
 * @param {object} clk - Clock with millis() method
 * @returns {object} Source with start() and stop() methods
 */
export default function lokiSource(url, query, interval, collector, clk) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  if (typeof query !== 'string' || query.length === 0) {
    throw new Error('Query must be a non-empty string');
  }
  const fetch = async (since, until) => {
    const params = new URLSearchParams({
      query: query,
      start: (since * 1000000).toString(),
      end: (until * 1000000).toString(),
      limit: '1000'
    });
    const response = await globalThis.fetch(`${url}/loki/api/v1/query_range?${params}`);
    const data = await response.json();
    const entries = [];
    if (data.data && data.data.result) {
      for (const stream of data.data.result) {
        for (const [ts, line] of stream.values) {
          entries.push({ ts: parseInt(ts, 10) / 1000000, line });
        }
      }
    }
    return entries;
  };
  return pollingSource(fetch, interval, collector, clk);
}
