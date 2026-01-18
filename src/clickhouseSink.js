import { createClient } from '@clickhouse/client';

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
export default function clickhouseSink(url, table) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  if (typeof table !== 'string' || table.length === 0) {
    throw new Error('Table must be a non-empty string');
  }
  const client = createClient({ url });
  return {
    /**
     * Writes records to ClickHouse table.
     *
     * @param {Array} records - Array of records to insert
     * @returns {Promise} Promise resolving when insert completes
     */
    write(records) {
      return client.insert({ table, values: records, format: 'JSONEachRow' });
    }
  };
}
