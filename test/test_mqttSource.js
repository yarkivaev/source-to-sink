import assert from 'node:assert';
import { describe, it } from 'mocha';
import mqttSource from '../src/mqttSource.js';

describe('mqttSource', () => {
  it('throws on missing url', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource(null, 'test/topic', collector),
      /URL must be a non-empty string/,
      'Should reject missing url'
    );
  });

  it('throws on empty url', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource('', 'test/topic', collector),
      /URL must be a non-empty string/,
      'Should reject empty url'
    );
  });

  it('throws on empty topic', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource('mqtt://localhost:1883', '', collector),
      /Topic must be a non-empty string/,
      'Should reject empty topic'
    );
  });

  it('throws on missing collector', () => {
    assert.throws(
      () => mqttSource('mqtt://localhost:1883', 'test', null),
      /Collector must have an accept\(\) method/,
      'Should reject missing collector'
    );
  });

  it('returns source with start and stop methods', () => {
    const collector = { accept: () => {} };
    const source = mqttSource('mqtt://localhost:1883', 'test/topic', collector);
    assert.strictEqual(typeof source.start, 'function', 'Should have start method');
    assert.strictEqual(typeof source.stop, 'function', 'Should have stop method');
  });

  it('accepts optional options parameter', () => {
    const collector = { accept: () => {} };
    const source = mqttSource('mqtt://localhost:1883', 'test/topic', collector, { clientId: 'test-client' });
    assert.strictEqual(typeof source.start, 'function', 'Should have start method');
    assert.strictEqual(typeof source.stop, 'function', 'Should have stop method');
  });
});
