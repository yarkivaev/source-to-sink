/**
 * ClickHouse sink for batch record insertion.
 *
 * Wraps a ClickHouse client and implements the Sink interface
 * for use with batch collectors.
 *
 * @example
 * const client = createClient({ host: 'http://localhost:8123' });
 * const sink = clickhouseSink(client, 'metrics');
 * sink.write([{ ts: Date.now(), value: 42 }]);
 *
 * @param {object} client - ClickHouse client with insert() method
 * @param {string} table - Target table name
 * @returns {object} Sink with write(records) method
 */
export default function clickhouseSink(client, table) {
  if (!client || typeof client.insert !== 'function') {
    throw new Error('Client must have an insert() method');
  }
  if (typeof table !== 'string' || table.length === 0) {
    throw new Error('Table must be a non-empty string');
  }
  return {
    /**
     * Writes records to ClickHouse table.
     *
     * @param {Array} records - Array of records to insert
     */
    write(records) {
      client.insert({ table, values: records });
    }
  };
}
