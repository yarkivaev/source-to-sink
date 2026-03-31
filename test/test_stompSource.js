import assert from 'node:assert';
import { describe, it } from 'mocha';
import stompSource from '../src/stompSource.js';

describe('stompSource', () => {
  it('throws on missing url', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => {return stompSource(null, '/queue/test', collector)},
      /URL must be a non-empty string/u,
      'Should reject missing url'
    );
  });

  it('throws on empty url', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => {return stompSource('', '/queue/test', collector)},
      /URL must be a non-empty string/u,
      'Should reject empty url'
    );
  });

  it('throws on empty destination', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => {return stompSource('stomp://localhost:61613', '', collector)},
      /Destination must be a non-empty string/u,
      'Should reject empty destination'
    );
  });

  it('throws on missing collector', () => {
    assert.throws(
      () => {return stompSource('stomp://localhost:61613', '/queue/test', null)},
      /Collector must have an accept\(\) method/u,
      'Should reject missing collector'
    );
  });

  it('returns source with start and stop methods', () => {
    const collector = { accept: () => {} };
    const source = stompSource('stomp://localhost:61613', '/queue/test', collector);
    assert.strictEqual(typeof source.start, 'function', 'Should have start method');
    assert.strictEqual(typeof source.stop, 'function', 'Should have stop method');
  });

  it('accepts optional options parameter', () => {
    const collector = { accept: () => {} };
    const source = stompSource('stomp://localhost:61613', '/queue/test', collector, { login: 'guest', passcode: 'guest' });
    assert.strictEqual(typeof source.start, 'function', 'Should have start method');
    assert.strictEqual(typeof source.stop, 'function', 'Should have stop method');
  });
});
