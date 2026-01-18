import assert from 'node:assert';
import { describe, it } from 'mocha';
import lokiSource from '../src/lokiSource.js';
import fakeClock from './fakeClock.js';

describe('lokiSource', () => {
  it('polls client after interval', async () => {
    let queried = false;
    const client = {
      query: async () => {
        queried = true;
        return [];
      }
    };
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = lokiSource(client, '{app="test"}', 0.05, collector, clk);
    source.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    source.stop();
    assert.strictEqual(queried, true, 'Should poll client after interval');
  });

  it('forwards entries to collector', async () => {
    const received = [];
    const entries = [
      { ts: Math.random(), line: `\u00e9${Math.random()}` },
      { ts: Math.random(), line: `\u4e2d${Math.random()}` }
    ];
    const client = {
      query: async () => entries
    };
    const collector = { accept: (entry) => received.push(entry) };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = lokiSource(client, '{app="test"}', 0.05, collector, clk);
    source.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    source.stop();
    assert.strictEqual(received.length, entries.length, 'Should forward all entries to collector');
  });

  it('ignores duplicate start calls', () => {
    let count = 0;
    const client = {
      query: async () => {
        count++;
        return [];
      }
    };
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    const source = lokiSource(client, '{app="test"}', 60, collector, clk);
    source.start();
    source.start();
    source.stop();
    assert.strictEqual(count, 0, 'Should not poll immediately on start');
  });

  it('ignores stop when not started', () => {
    const client = { query: async () => [] };
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    const source = lokiSource(client, '{app="test"}', 60, collector, clk);
    source.stop();
    assert.strictEqual(true, true, 'Should not throw on stop when not started');
  });

  it('stops polling on stop', async () => {
    let count = 0;
    const client = {
      query: async () => {
        count++;
        return [];
      }
    };
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    const source = lokiSource(client, '{app="test"}', 0.03, collector, clk);
    source.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    source.stop();
    const before = count;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(count, before, 'Should stop polling after stop');
  });

  it('throws on missing client', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource(null, '{app="test"}', 10, collector, clk),
      /Client must have a query\(\) method/,
      'Should reject missing client'
    );
  });

  it('throws on empty query', () => {
    const client = { query: async () => [] };
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource(client, '', 10, collector, clk),
      /Query must be a non-empty string/,
      'Should reject empty query'
    );
  });

  it('throws on invalid interval', () => {
    const client = { query: async () => [] };
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource(client, '{app="test"}', -1, collector, clk),
      /Interval must be a positive number/,
      'Should reject invalid interval'
    );
  });

  it('throws on missing collector', () => {
    const client = { query: async () => [] };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource(client, '{app="test"}', 10, null, clk),
      /Collector must have an accept\(\) method/,
      'Should reject missing collector'
    );
  });

  it('throws on missing clock', () => {
    const client = { query: async () => [] };
    const collector = { accept: () => {} };
    assert.throws(
      () => lokiSource(client, '{app="test"}', 10, collector, null),
      /Clock must have a millis\(\) method/,
      'Should reject missing clock'
    );
  });
});
