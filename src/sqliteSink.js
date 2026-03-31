import Database from 'better-sqlite3';

/**
 * SQLite sink for batch record insertion.
 *
 * Opens a SQLite database in WAL mode and implements the Sink
 * interface for use with batch collectors. Creates the target
 * table with the given columns if it does not exist.
 *
 * @example
 * const sink = sqliteSink('/tmp/metrics.db', 'metrics', ['topic', 'ts', 'value']);
 * sink.write([{ topic: 'sensor/1', ts: 1700000000000, value: 42 }]);
 *
 * @param {string} path - Filesystem path to the SQLite database file
 * @param {string} table - Target table name
 * @param {Array<string>} columns - Column names for insertion
 * @returns {object} Sink with write(records) and close() methods
 */
export default function sqliteSink(path, table, columns) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Path must be a non-empty string');
  }
  if (typeof table !== 'string' || table.length === 0) {
    throw new Error('Table must be a non-empty string');
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('Columns must be a non-empty array');
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  const placeholders = columns.map(() => {return '?'}).join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  const statement = db.prepare(sql);
  const transaction = db.transaction((records) => {
    for (const record of records) {
      statement.run(...columns.map((col) => {return record[col]}));
    }
  });
  return {
    /**
     * Writes records to SQLite table inside a transaction.
     *
     * @param {Array} records - Array of objects with keys matching columns
     */
    write(records) {
      transaction(records);
    },
    /**
     * Closes the database connection.
     */
    close() {
      db.close();
    }
  };
}
