import assert from 'node:assert';
import { describe, it } from 'mocha';
import timedBatch from '../src/timedBatch.js';

describe('timedBatch', () => {
  it('flushes after interval expires', async () => {
    const received = [];
    const origin = {
      accept: (record) => received.push(record),
      flush: () => {},
      stop: () => {}
    };
    let flushed = false;
    origin.flush = () => { flushed = true; };
    const interval = 0.05;
    const timed = timedBatch(origin, interval);
    timed.accept({ data: `\u0410\u0411\u0412${Math.random()}` });
    await new Promise(resolve => setTimeout(resolve, 100));
    timed.stop();
    assert.strictEqual(flushed, true, 'Should flush after interval');
  });

  it('delegates accept to origin', () => {
    const received = [];
    const origin = {
      accept: (record) => received.push(record),
      flush: () => {},
      stop: () => {}
    };
    const timed = timedBatch(origin, 60);
    const record = { value: `\u00e9\u00f1\u00fc${Math.random()}` };
    timed.accept(record);
    timed.stop();
    assert.strictEqual(received.length, 1, 'Should delegate accept to origin');
  });

  it('delegates flush to origin and cancels timer', () => {
    let flushed = false;
    const origin = {
      accept: () => {},
      flush: () => { flushed = true; },
      stop: () => {}
    };
    const timed = timedBatch(origin, 60);
    timed.accept({ x: Math.random() });
    timed.flush();
    timed.stop();
    assert.strictEqual(flushed, true, 'Should delegate flush to origin');
  });

  it('delegates stop to origin and cancels timer', () => {
    let stopped = false;
    const origin = {
      accept: () => {},
      flush: () => {},
      stop: () => { stopped = true; }
    };
    const timed = timedBatch(origin, 60);
    timed.accept({ y: Math.random() });
    timed.stop();
    assert.strictEqual(stopped, true, 'Should delegate stop to origin');
  });

  it('does not flush twice when interval passes then manual flush', async () => {
    let count = 0;
    const origin = {
      accept: () => {},
      flush: () => { count++; },
      stop: () => {}
    };
    const interval = 0.05;
    const timed = timedBatch(origin, interval);
    timed.accept({ z: Math.random() });
    timed.flush();
    await new Promise(resolve => setTimeout(resolve, 100));
    timed.stop();
    assert.strictEqual(count, 1, 'Should not flush twice after manual flush');
  });

  it('throws on missing accept method', () => {
    const origin = { flush: () => {}, stop: () => {} };
    assert.throws(
      () => timedBatch(origin, 1),
      /Origin must have an accept\(\) method/,
      'Should reject origin without accept'
    );
  });

  it('throws on missing flush method', () => {
    const origin = { accept: () => {}, stop: () => {} };
    assert.throws(
      () => timedBatch(origin, 1),
      /Origin must have a flush\(\) method/,
      'Should reject origin without flush'
    );
  });

  it('throws on missing stop method', () => {
    const origin = { accept: () => {}, flush: () => {} };
    assert.throws(
      () => timedBatch(origin, 1),
      /Origin must have a stop\(\) method/,
      'Should reject origin without stop'
    );
  });

  it('throws on invalid interval', () => {
    const origin = { accept: () => {}, flush: () => {}, stop: () => {} };
    const invalid = -Math.random() * 10;
    assert.throws(
      () => timedBatch(origin, invalid),
      /Interval must be a positive number/,
      'Should reject invalid interval'
    );
  });
});
