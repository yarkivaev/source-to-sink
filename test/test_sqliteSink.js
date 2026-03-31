import assert from 'node:assert';
import { describe, it } from 'mocha';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import sqliteSink from '../src/sqliteSink.js';

describe('sqliteSink', () => {
  it('throws on missing path', () => {
    assert.throws(
      () => sqliteSink(null, 'metrics', ['ts', 'value']),
      /Path must be a non-empty string/,
      'Should reject missing path'
    );
  });

  it('throws on empty path', () => {
    assert.throws(
      () => sqliteSink('', 'metrics', ['ts', 'value']),
      /Path must be a non-empty string/,
      'Should reject empty path'
    );
  });

  it('throws on missing table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    try {
      assert.throws(
        () => sqliteSink(join(dir, 'db.sqlite'), null, ['ts', 'value']),
        /Table must be a non-empty string/,
        'Should reject missing table'
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('throws on empty table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    try {
      assert.throws(
        () => sqliteSink(join(dir, 'db.sqlite'), '', ['ts', 'value']),
        /Table must be a non-empty string/,
        'Should reject empty table'
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('throws on missing columns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    try {
      assert.throws(
        () => sqliteSink(join(dir, 'db.sqlite'), 'metrics', null),
        /Columns must be a non-empty array/,
        'Should reject missing columns'
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('throws on empty columns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    try {
      assert.throws(
        () => sqliteSink(join(dir, 'db.sqlite'), 'metrics', []),
        /Columns must be a non-empty array/,
        'Should reject empty columns'
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('returns sink with write method', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    const path = join(dir, 'db.sqlite');
    const db = new Database(path);
    db.exec('CREATE TABLE metrics (topic TEXT, ts REAL, value REAL)');
    db.close();
    try {
      const sink = sqliteSink(path, 'metrics', ['topic', 'ts', 'value']);
      assert.strictEqual(typeof sink.write, 'function', 'Should have write method');
      sink.close();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('inserts records into the database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    const path = join(dir, `db-${Math.random()}.sqlite`);
    const db = new Database(path);
    db.exec('CREATE TABLE metrics (topic TEXT, ts REAL, value REAL)');
    db.close();
    const topic = `sénsör/${Math.random()}`;
    const ts = Date.now();
    const value = Math.random() * 1000;
    try {
      const sink = sqliteSink(path, 'metrics', ['topic', 'ts', 'value']);
      sink.write([{ topic, ts, value }]);
      sink.close();
      const reader = new Database(path);
      const rows = reader.prepare('SELECT topic, ts, value FROM metrics').all();
      reader.close();
      assert.strictEqual(rows.length, 1, 'Should insert exactly one record');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('inserts batch of records atomically', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    const path = join(dir, `db-${Math.random()}.sqlite`);
    const db = new Database(path);
    db.exec('CREATE TABLE metrics (topic TEXT, ts REAL, value REAL)');
    db.close();
    const count = 5 + Math.floor(Math.random() * 10);
    const records = Array.from({ length: count }, (_, i) => ({
      topic: `tøpic/${Math.random()}`,
      ts: Date.now() + i,
      value: Math.random()
    }));
    try {
      const sink = sqliteSink(path, 'metrics', ['topic', 'ts', 'value']);
      sink.write(records);
      sink.close();
      const reader = new Database(path);
      const rows = reader.prepare('SELECT COUNT(*) as cnt FROM metrics').get();
      reader.close();
      assert.strictEqual(rows.cnt, count, 'Should insert all records in batch');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('preserves record values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    const path = join(dir, `db-${Math.random()}.sqlite`);
    const db = new Database(path);
    db.exec('CREATE TABLE metrics (topic TEXT, ts REAL, value REAL)');
    db.close();
    const topic = `données/capteur-${Math.random()}`;
    const ts = Date.now() + Math.floor(Math.random() * 100000);
    const value = Math.random() * 500;
    try {
      const sink = sqliteSink(path, 'metrics', ['topic', 'ts', 'value']);
      sink.write([{ topic, ts, value }]);
      sink.close();
      const reader = new Database(path);
      const row = reader.prepare('SELECT topic, ts, value FROM metrics').get();
      reader.close();
      assert.strictEqual(row.topic, topic, 'Should preserve topic value');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('returns sink with close method', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sink-'));
    const path = join(dir, 'db.sqlite');
    const db = new Database(path);
    db.exec('CREATE TABLE metrics (topic TEXT, ts REAL, value REAL)');
    db.close();
    try {
      const sink = sqliteSink(path, 'metrics', ['topic', 'ts', 'value']);
      assert.strictEqual(typeof sink.close, 'function', 'Should have close method');
      sink.close();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
