import assert from 'node:assert';
import { describe, it, before, after } from 'mocha';
import { GenericContainer } from 'testcontainers';
import { createClient } from '@clickhouse/client';
import clickhouseSink from '../src/clickhouseSink.js';

describe('clickhouseSink integration', function() {
  let container;
  let client;
  let url;

  before(async function() {
    this.timeout(120000);
    container = await new GenericContainer('clickhouse/clickhouse-server:24')
      .withExposedPorts(8123)
      .withStartupTimeout(60000)
      .start();
    const host = container.getHost();
    const port = container.getMappedPort(8123);
    url = `http://${host}:${port}`;
    client = createClient({ url });
    let retries = 30;
    while (retries > 0) {
      try {
        await client.query({ query: 'SELECT 1', format: 'JSON' });
        break;
      } catch {
        retries -= 1;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    await client.command({ query: 'CREATE DATABASE IF NOT EXISTS test' });
    await client.command({
      query: `CREATE TABLE IF NOT EXISTS test.metrics (
        topic String,
        ts DateTime64(3),
        value Float64
      ) ENGINE = MergeTree() ORDER BY (topic, ts)`
    });
  });

  after(async function() {
    this.timeout(30000);
    if (client) {
      await client.close();
    }
    if (container) {
      await container.stop();
    }
  });

  it('inserts records to clickhouse table', async function() {
    const topic = `topic${Math.random().toString(36).slice(2)}`;
    const value = Math.random() * 100;
    const ts = Date.now();
    const sink = clickhouseSink(url, 'test.metrics');
    await sink.write([{ topic, ts, value }]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = await client.query({
      query: `SELECT * FROM test.metrics WHERE topic = '${topic}'`,
      format: 'JSONEachRow'
    });
    const rows = await result.json();
    assert.strictEqual(rows.length >= 1, true, 'Should insert record to table');
  });

  it('inserts multiple records in single batch', async function() {
    const topic = `batch${Math.random().toString(36).slice(2)}`;
    const records = [
      { topic, ts: Date.now(), value: Math.random() * 100 },
      { topic, ts: Date.now() + 1, value: Math.random() * 100 },
      { topic, ts: Date.now() + 2, value: Math.random() * 100 }
    ];
    const sink = clickhouseSink(url, 'test.metrics');
    await sink.write(records);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = await client.query({
      query: `SELECT * FROM test.metrics WHERE topic = '${topic}'`,
      format: 'JSONEachRow'
    });
    const rows = await result.json();
    assert.strictEqual(rows.length >= 3, true, 'Should insert all records in batch');
  });

  it('inserts record with unicode topic', async function() {
    const topic = `тест${Math.random().toString(36).slice(2)}`;
    const value = Math.random() * 100;
    const ts = Date.now();
    const sink = clickhouseSink(url, 'test.metrics');
    await sink.write([{ topic, ts, value }]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const result = await client.query({
      query: `SELECT * FROM test.metrics WHERE topic = '${topic}'`,
      format: 'JSONEachRow'
    });
    const rows = await result.json();
    assert.strictEqual(rows.length >= 1, true, 'Should insert record with unicode topic');
  });
});
