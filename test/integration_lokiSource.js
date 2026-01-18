import assert from 'node:assert';
import { describe, it, before, after } from 'mocha';
import { GenericContainer } from 'testcontainers';
import lokiSource from '../src/lokiSource.js';
import clock from '../src/clock.js';

/**
 * Pushes a log entry to Loki via HTTP API.
 *
 * @param {string} url - Loki base URL
 * @param {object} labels - Stream labels
 * @param {string} line - Log line content
 */
async function pushToLoki(url, labels, line) {
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

describe('lokiSource integration', function() {
  let container;
  let url;

  before(async function() {
    this.timeout(120000);
    container = await new GenericContainer('grafana/loki:2.9.0')
      .withExposedPorts(3100)
      .withStartupTimeout(60000)
      .start();
    const host = container.getHost();
    const port = container.getMappedPort(3100);
    url = `http://${host}:${port}`;
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
    const source = lokiSource(url, `{app="${app}"}`, 0.5, collector, clk);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await pushToLoki(url, { app }, `test entry ${Math.random()}`);
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
    const source = lokiSource(url, `{app="${app}"}`, 0.5, collector, clk);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await pushToLoki(url, { app }, `тест запись ${Math.random()}`);
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
    const source = lokiSource(url, `{app="${app}"}`, 0.5, collector, clk);
    source.start();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    source.stop();
    const before = received.length;
    await pushToLoki(url, { app }, `after stop ${Math.random()}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.strictEqual(received.length, before, 'Should not receive entries after stop');
  });
});
