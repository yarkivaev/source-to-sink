import assert from 'node:assert';
import { describe, it } from 'mocha';
import pollingSource from '../src/pollingSource.js';
import fakeClock from './fakeClock.js';

describe('pollingSource', () => {
  it('polls fetch after interval', async () => {
    let polled = false;
    const fetch = async () => {
      polled = true;
      return [];
    };
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = pollingSource(fetch, 0.05, collector, clk);
    source.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    source.stop();
    assert.strictEqual(polled, true, 'Should poll fetch after interval');
  });

  it('forwards entries to collector', async () => {
    const received = [];
    const entries = [
      { ts: Math.random(), line: `\u00e9${Math.random()}` },
      { ts: Math.random(), line: `\u4e2d${Math.random()}` }
    ];
    const fetch = async () => entries;
    const collector = { accept: (entry) => received.push(entry) };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = pollingSource(fetch, 0.05, collector, clk);
    source.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    source.stop();
    assert.strictEqual(received.length, entries.length, 'Should forward all entries to collector');
  });

  it('passes time window to fetch', async () => {
    let captured = null;
    const fetch = async (since, until) => {
      captured = { since, until };
      return [];
    };
    const collector = { accept: () => {} };
    const clk = fakeClock(1000);
    const source = pollingSource(fetch, 0.05, collector, clk);
    source.start();
    await new Promise(resolve => setTimeout(resolve, 100));
    source.stop();
    assert.strictEqual(captured !== null, true, 'Should pass time window to fetch');
  });

  it('ignores duplicate start calls', () => {
    let count = 0;
    const fetch = async () => {
      count += 1;
      return [];
    };
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    const source = pollingSource(fetch, 60, collector, clk);
    source.start();
    source.start();
    source.stop();
    assert.strictEqual(count, 0, 'Should not poll immediately on start');
  });

  it('ignores stop when not started', () => {
    const fetch = async () => [];
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    const source = pollingSource(fetch, 60, collector, clk);
    source.stop();
    assert.strictEqual(true, true, 'Should not throw on stop when not started');
  });

  it('stops polling on stop', async () => {
    let count = 0;
    const fetch = async () => {
      count += 1;
      return [];
    };
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    const source = pollingSource(fetch, 0.03, collector, clk);
    source.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    source.stop();
    const before = count;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(count, before, 'Should stop polling after stop');
  });

  it('throws on missing fetch', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => pollingSource(null, 10, collector, clk),
      /Fetch must be a function/,
      'Should reject missing fetch'
    );
  });

  it('throws on invalid interval', () => {
    const fetch = async () => [];
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => pollingSource(fetch, -1, collector, clk),
      /Interval must be a positive number/,
      'Should reject invalid interval'
    );
  });

  it('throws on missing collector', () => {
    const fetch = async () => [];
    const clk = fakeClock(0);
    assert.throws(
      () => pollingSource(fetch, 10, null, clk),
      /Collector must have an accept\(\) method/,
      'Should reject missing collector'
    );
  });

  it('throws on missing clock', () => {
    const fetch = async () => [];
    const collector = { accept: () => {} };
    assert.throws(
      () => pollingSource(fetch, 10, collector, null),
      /Clock must have a millis\(\) method/,
      'Should reject missing clock'
    );
  });
});
