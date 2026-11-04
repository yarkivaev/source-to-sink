import { createClient } from '@clickhouse/client';
import deadline from './deadline.js';
import positive from './positive.js';

/**
 * ClickHouse sink for batch record insertion.
 *
 * Creates a ClickHouse client internally and implements the Sink
 * interface for use with batch collectors.
 *
 * @example
 * const sink = clickhouseSink('http://localhost:8123', 'metrics');
 * await sink.write([{ ts: Date.now(), value: 42 }]);
 *
 * @param {string} url - ClickHouse URL (e.g., 'http://localhost:8123')
 * @param {string} table - Target table name
 * @returns {object} Sink with write(records) method
 */
export default function clickhouseSink(url, table, options = {}) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  if (typeof table !== 'string' || table.length === 0) {
    throw new Error('Table must be a non-empty string');
  }
  positive(options.stopTimeoutMs ?? 5000, 'stopTimeoutMs');
  const client = (options.createClient || createClient)({ url });
  let stopping;
  return {
    /**
     * Writes records to ClickHouse table.
     *
     * @param {Array} records - Array of records to insert
     * @returns {Promise} Promise resolving when insert completes
     */
    write(records, { signal } = {}) {
      if (stopping) { return Promise.reject(new Error('ClickHouse sink stopped')); }
      if (signal?.aborted) { return Promise.reject(signal.reason || new Error('ClickHouse write aborted')); }
      // Native ClickHouse API uses snake_case for cancellation.
      // eslint-disable-next-line camelcase
      return client.insert({ table, values: records, format: 'JSONEachRow', abort_signal: signal });
    },
    stop() {
      stopping ??= deadline(Promise.resolve().then(() => { return client.close(); }), options.stopTimeoutMs ?? 5000, 'ClickHouse close');
      return stopping;
    }
  };
}
