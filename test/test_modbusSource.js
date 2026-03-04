import assert from 'node:assert';
import { describe, it } from 'mocha';
import modbusSource from '../src/modbusSource.js';
import fakeClock from './fakeClock.js';

describe('modbusSource', () => {
  it('throws on empty host', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => modbusSource('', 502, 4000, 14, 5, collector, clk),
      /Host must be a non-empty string/,
      'Should reject empty host'
    );
  });

  it('throws on missing host', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => modbusSource(null, 502, 4000, 14, 5, collector, clk),
      /Host must be a non-empty string/,
      'Should reject null host'
    );
  });

  it('throws on invalid port', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => modbusSource('192.168.2.148', -1, 4000, 14, 5, collector, clk),
      /Port must be a positive number/,
      'Should reject negative port'
    );
  });

  it('throws on negative address', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => modbusSource('192.168.2.148', 502, -1, 14, 5, collector, clk),
      /Address must be a non-negative number/,
      'Should reject negative address'
    );
  });

  it('throws on invalid count', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => modbusSource('192.168.2.148', 502, 4000, 0, 5, collector, clk),
      /Count must be a positive number/,
      'Should reject zero count'
    );
  });

  it('throws on missing collector', () => {
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => modbusSource('192.168.2.148', 502, 4000, 14, 5, null, clk),
      /Collector must have an accept\(\) method/,
      'Should reject null collector'
    );
  });

  it('throws on missing clock', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => modbusSource('192.168.2.148', 502, 4000, 14, 5, collector, null),
      /Clock must have a millis\(\) method/,
      'Should reject null clock'
    );
  });

  it('creates source with start and stop methods', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = modbusSource(`\u00e9${Math.random()}`, 502, 4000, 14, 5, collector, clk);
    assert.strictEqual(typeof source.start, 'function', 'Should have start method');
  });

  it('creates source with stop method', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = modbusSource(`\u4e2d${Math.random()}`, 502, 4000, 14, 5, collector, clk);
    assert.strictEqual(typeof source.stop, 'function', 'Should have stop method');
  });

  it('stops without error when not started', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = modbusSource(`\u3042${Math.random()}`, 502, 4000, 14, 5, collector, clk);
    source.stop();
    assert.strictEqual(true, true, 'Should not throw when stopping without start');
  });
});
