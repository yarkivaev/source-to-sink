import assert from 'node:assert';
import { describe, it, before, after } from 'mocha';
import { GenericContainer } from 'testcontainers';
import lokiSource from '../src/lokiSource.js';
import clock from '../src/clock.js';

/**
 * Creates a Loki client wrapper for testing.
 *
 * @param {string} url - Loki base URL
 * @returns {object} Client with query() and push() methods
 */
function lokiClient(url) {
  return {
    async query(logql, since, until) {
      const params = new URLSearchParams({
        query: logql,
        start: (since * 1000000).toString(),
        end: (until * 1000000).toString(),
        limit: '1000'
      });
      const response = await fetch(`${url}/loki/api/v1/query_range?${params}`);
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
    },
    async push(labels, line) {
      const ts = Date.now() * 1000000;
      const payload = {
        streams: [{
          stream: labels,
          values: [[ts.toString(), line]]
        }]
      };
      await fetch(`${url}/loki/api/v1/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  };
}

describe('lokiSource integration', function() {
  let container;
  let client;

  before(async function() {
    this.timeout(120000);
    container = await new GenericContainer('grafana/loki:2.9.0')
      .withExposedPorts(3100)
      .withStartupTimeout(60000)
      .start();
    const host = container.getHost();
    const port = container.getMappedPort(3100);
    const url = `http://${host}:${port}`;
    client = lokiClient(url);
    let retries = 30;
    while (retries > 0) {
      try {
        const response = await fetch(`${url}/ready`);
        if (response.ok) {
          break;
        }
      } catch {
        // Loki not ready yet
      }
      retries -= 1;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });

  after(async function() {
    this.timeout(30000);
    if (container) {
      await container.stop();
    }
  });

  it('receives entries from loki', async function() {
    this.timeout(30000);
    const received = [];
    const app = `app${Math.random().toString(36).slice(2)}`;
    const collector = { accept: (entry) => received.push(entry) };
    const clk = clock();
    const source = lokiSource(client, `{app="${app}"}`, 0.5, collector, clk);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await client.push({ app }, `test entry ${Math.random()}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    source.stop();
    assert.strictEqual(received.length >= 1, true, 'Should receive entries from Loki');
  });

  it('receives entries with unicode content', async function() {
    this.timeout(30000);
    const received = [];
    const app = `app${Math.random().toString(36).slice(2)}`;
    const collector = { accept: (entry) => received.push(entry) };
    const clk = clock();
    const source = lokiSource(client, `{app="${app}"}`, 0.5, collector, clk);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await client.push({ app }, `тест запись ${Math.random()}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    source.stop();
    assert.strictEqual(received.length >= 1, true, 'Should receive entries with unicode');
  });

  it('stops polling after stop is called', async function() {
    this.timeout(30000);
    const received = [];
    const app = `app${Math.random().toString(36).slice(2)}`;
    const collector = { accept: (entry) => received.push(entry) };
    const clk = clock();
    const source = lokiSource(client, `{app="${app}"}`, 0.5, collector, clk);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    source.stop();
    const before = received.length;
    await client.push({ app }, `after stop ${Math.random()}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.strictEqual(received.length, before, 'Should not receive entries after stop');
  });
});
