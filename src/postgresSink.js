import pg from 'pg';

/**
 * PostgreSQL sink for batch record insertion.
 *
 * Creates a pg.Pool internally and implements the Sink
 * interface for use with batch collectors. Supports optional
 * conflict resolution via ON CONFLICT DO NOTHING.
 *
 * @example
 * const sink = postgresSink('postgresql://localhost:5432/db', 'metrics', ['ts', 'value']);
 * await sink.write([{ ts: Date.now(), value: 42 }]);
 *
 * @example
 * const sink = postgresSink('postgresql://localhost:5432/db', 'segments',
 *   ['machine', 'name', 'start_time'], { conflict: ['machine', 'start_time'] });
 * await sink.write([{ machine: 'a', name: 'on', start_time: '2024-01-01' }]);
 *
 * @param {string} url - PostgreSQL URL (e.g., 'postgresql://localhost:5432/db')
 * @param {string} table - Target table name
 * @param {Array<string>} columns - Column names for insertion
 * @param {object} [options] - Optional configuration
 * @param {Array<string>} [options.conflict] - Columns for ON CONFLICT DO NOTHING clause
 * @returns {object} Sink with write(records) method
 */
export default function postgresSink(url, table, columns, options = {}) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('URL must be a non-empty string');
  }
  if (typeof table !== 'string' || table.length === 0) {
    throw new Error('Table must be a non-empty string');
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Columns must be a non-empty array');
  }
  const pool = new pg.Pool({ connectionString: url });
  const suffix = Array.isArray(options.conflict) && options.conflict.length > 0
    ? ` ON CONFLICT (${options.conflict.join(', ')}) DO NOTHING`
    : '';
  return {
    /**
     * Writes records to PostgreSQL table.
     *
     * @param {Array} records - Array of objects with keys matching columns
     * @returns {Promise} Promise resolving when insert completes
     */
    write(records) {
      const placeholders = records.map((_, i) => {
        const offset = i * columns.length;
        const row = columns.map((__, j) => `$${offset + j + 1}`).join(', ');
        return `(${row})`;
      }).join(', ');
      const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}${suffix}`;
      const values = records.flatMap((record) => columns.map((col) => record[col]));
      return pool.query(query, values);
    }
  };
}
