import assert from 'node:assert';
import { describe, it } from 'mocha';
import lokiSource from '../src/lokiSource.js';
import fakeClock from './fakeClock.js';

describe('lokiSource', () => {
  it('throws on missing url', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource(null, '{app="test"}', 10, collector, clk),
      /URL must be a non-empty string/,
      'Should reject missing url'
    );
  });

  it('throws on empty url', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource('', '{app="test"}', 10, collector, clk),
      /URL must be a non-empty string/,
      'Should reject empty url'
    );
  });

  it('throws on empty query', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource('http://localhost:3100', '', 10, collector, clk),
      /Query must be a non-empty string/,
      'Should reject empty query'
    );
  });

  it('throws on invalid interval', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource('http://localhost:3100', '{app="test"}', -1, collector, clk),
      /Interval must be a positive number/,
      'Should reject invalid interval'
    );
  });

  it('throws on missing collector', () => {
    const clk = fakeClock(0);
    assert.throws(
      () => lokiSource('http://localhost:3100', '{app="test"}', 10, null, clk),
      /Collector must have an accept\(\) method/,
      'Should reject missing collector'
    );
  });

  it('throws on missing clock', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => lokiSource('http://localhost:3100', '{app="test"}', 10, collector, null),
      /Clock must have a millis\(\) method/,
      'Should reject missing clock'
    );
  });

  it('returns source with start and stop methods', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(0);
    const source = lokiSource('http://localhost:3100', '{app="test"}', 10, collector, clk);
    assert.strictEqual(typeof source.start, 'function', 'Should have start method');
    assert.strictEqual(typeof source.stop, 'function', 'Should have stop method');
  });
});
