import assert from 'node:assert';
import { describe, it } from 'mocha';
import circuit from '../src/circuit.js';
import fakeClock from './fakeClock.js';

describe('circuit', () => {
  it('starts allowing operations', () => {
    const threshold = Math.floor(Math.random() * 10) + 1;
    const timeout = Math.random() * 100 + 1;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(threshold, timeout, clk);
    assert.strictEqual(c.allowing(), true, 'Circuit should start allowing');
  });

  it('remains allowing after fewer failures than threshold', () => {
    const threshold = Math.floor(Math.random() * 5) + 3;
    const timeout = Math.random() * 100 + 1;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(threshold, timeout, clk);
    for (let i = 0; i < threshold - 1; i++) {
      c.fail();
    }
    assert.strictEqual(c.allowing(), true, 'Circuit should remain allowing below threshold');
  });

  it('stops allowing after reaching failure threshold', () => {
    const threshold = Math.floor(Math.random() * 5) + 1;
    const timeout = Math.random() * 100 + 1;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(threshold, timeout, clk);
    for (let i = 0; i < threshold; i++) {
      c.fail();
    }
    assert.strictEqual(c.allowing(), false, 'Circuit should stop allowing at threshold');
  });

  it('resets failure count on succeed', () => {
    const threshold = Math.floor(Math.random() * 5) + 2;
    const timeout = Math.random() * 100 + 1;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(threshold, timeout, clk);
    for (let i = 0; i < threshold - 1; i++) {
      c.fail();
    }
    c.succeed();
    c.fail();
    assert.strictEqual(c.allowing(), true, 'Circuit should be allowing after succeed resets count');
  });

  it('allows again after timeout expires', () => {
    const threshold = Math.floor(Math.random() * 5) + 1;
    const timeout = 60;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(threshold, timeout, clk);
    for (let i = 0; i < threshold; i++) {
      c.fail();
    }
    clk.advance(timeout * 1000);
    assert.strictEqual(c.allowing(), true, 'Circuit should allow after timeout');
  });

  it('throws on invalid threshold', () => {
    const timeout = Math.random() * 100 + 1;
    const invalid = -Math.floor(Math.random() * 10);
    const clk = fakeClock(0);
    assert.throws(
      () => circuit(invalid, timeout, clk),
      /Threshold must be a positive number/,
      'Should reject invalid threshold'
    );
  });

  it('throws on invalid timeout', () => {
    const threshold = Math.floor(Math.random() * 10) + 1;
    const invalid = -Math.random() * 10 - 1;
    const clk = fakeClock(0);
    assert.throws(
      () => circuit(threshold, invalid, clk),
      /Timeout must be a non-negative number/,
      'Should reject invalid timeout'
    );
  });

  it('throws on missing clock', () => {
    const threshold = Math.floor(Math.random() * 10) + 1;
    const timeout = Math.random() * 100 + 1;
    assert.throws(
      () => circuit(threshold, timeout),
      /Clock must have a millis\(\) method/,
      'Should reject missing clock'
    );
  });

  it('resets failures when circuit allows again after timeout', () => {
    const threshold = Math.floor(Math.random() * 3) + 1;
    const timeout = 60;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(threshold, timeout, clk);
    for (let i = 0; i < threshold; i++) {
      c.fail();
    }
    clk.advance(timeout * 1000);
    c.allowing();
    for (let i = 0; i < threshold - 1; i++) {
      c.fail();
    }
    assert.strictEqual(c.allowing(), true, 'Circuit should remain allowing after reset');
  });
});
