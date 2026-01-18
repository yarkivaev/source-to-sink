import assert from 'node:assert';
import { describe, it } from 'mocha';
import clickhouseSink from '../src/clickhouseSink.js';

describe('clickhouseSink', () => {
  it('inserts records to specified table', () => {
    let inserted = [];
    const client = {
      insert: ({ table, values }) => { inserted = { table, values }; }
    };
    const table = `table_${Math.random().toString(36).slice(2)}`;
    const sink = clickhouseSink(client, table);
    const records = [{ ts: Math.random(), value: `\u00e9${Math.random()}` }];
    sink.write(records);
    assert.strictEqual(inserted.table, table, 'Should insert to correct table');
  });

  it('passes records to client insert', () => {
    let inserted = [];
    const client = {
      insert: ({ table, values }) => { inserted = { table, values }; }
    };
    const sink = clickhouseSink(client, 'metrics');
    const records = [
      { ts: Math.random(), value: `\u4e2d\u6587${Math.random()}` },
      { ts: Math.random(), value: `\u0410\u0411${Math.random()}` }
    ];
    sink.write(records);
    assert.strictEqual(inserted.values.length, 2, 'Should pass all records to client');
  });

  it('throws on missing client', () => {
    assert.throws(
      () => clickhouseSink(null, 'metrics'),
      /Client must have an insert\(\) method/,
      'Should reject missing client'
    );
  });

  it('throws on client without insert method', () => {
    const client = { query: () => {} };
    assert.throws(
      () => clickhouseSink(client, 'metrics'),
      /Client must have an insert\(\) method/,
      'Should reject client without insert'
    );
  });

  it('throws on missing table', () => {
    const client = { insert: () => {} };
    assert.throws(
      () => clickhouseSink(client, ''),
      /Table must be a non-empty string/,
      'Should reject empty table'
    );
  });

  it('throws on non-string table', () => {
    const client = { insert: () => {} };
    assert.throws(
      () => clickhouseSink(client, 123),
      /Table must be a non-empty string/,
      'Should reject non-string table'
    );
  });
});
