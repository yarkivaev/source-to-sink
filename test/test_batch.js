import assert from 'node:assert';
import { describe, it } from 'mocha';
import batch from '../src/batch.js';
import circuit from '../src/circuit.js';
import fakeClock from './fakeClock.js';

describe('batch', () => {
  it('flushes when batch size is reached', () => {
    const received = [];
    const sink = { write: (records) => {return received.push(...records)} };
    const size = Math.floor(Math.random() * 5) + 2;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(5, 60, clk);
    const b = batch(sink, size, c);
    for (let i = 0; i < size; i += 1) {
      b.accept({ value: `\u00e9\u00f1\u00fc${i}` });
    }
    b.stop();
    assert.strictEqual(received.length, size, 'Should flush all records at size');
  });

  it('flushes on manual flush call', () => {
    const received = [];
    const sink = { write: (records) => {return received.push(...records)} };
    const count = Math.floor(Math.random() * 5) + 1;
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(5, 60, clk);
    const b = batch(sink, 100, c);
    for (let i = 0; i < count; i += 1) {
      b.accept({ id: `\u4e2d\u6587${i}` });
    }
    b.flush();
    b.stop();
    assert.strictEqual(received.length, count, 'Should flush all records on manual flush');
  });

  it('does not flush empty batch', () => {
    let called = false;
    const sink = { write: () => { called = true; } };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(5, 60, clk);
    const b = batch(sink, 10, c);
    b.flush();
    b.stop();
    assert.strictEqual(called, false, 'Should not call write on empty batch');
  });

  it('clears records on stop', () => {
    const received = [];
    const sink = { write: (records) => {return received.push(...records)} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(5, 60, clk);
    const b = batch(sink, 100, c);
    const count = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < count; i += 1) {
      b.accept({ x: Math.random() });
    }
    b.stop();
    b.flush();
    assert.strictEqual(received.length, 0, 'Should clear records on stop');
  });

  it('respects circuit when allowing', () => {
    const received = [];
    const sink = { write: (records) => {return received.push(...records)} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(5, 60, clk);
    const b = batch(sink, 2, c);
    b.accept({ v: `\u3042${Math.random()}` });
    b.accept({ v: `\u3044${Math.random()}` });
    b.stop();
    assert.strictEqual(received.length, 2, 'Should flush when circuit is allowing');
  });

  it('skips flush when circuit is not allowing', () => {
    const received = [];
    const sink = { write: (records) => {return received.push(...records)} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const c = circuit(1, 60, clk);
    c.fail();
    const b = batch(sink, 2, c);
    b.accept({ v: Math.random() });
    b.accept({ v: Math.random() });
    b.stop();
    assert.strictEqual(received.length, 0, 'Should skip flush when circuit is not allowing');
  });

  it('calls succeed on circuit after flush', () => {
    let succeeded = false;
    const sink = { write: () => {} };
    const c = {
      allowing: () => {return true},
      succeed: () => { succeeded = true; },
      fail: () => {}
    };
    const b = batch(sink, 1, c);
    b.accept({ data: `\u00df${Math.random()}` });
    b.stop();
    assert.strictEqual(succeeded, true, 'Should call succeed on circuit');
  });

  it('propagates error when sink throws', () => {
    const sink = { write: () => { throw new Error('Sink failure'); } };
    const c = {
      allowing: () => {return true},
      succeed: () => {},
      fail: () => {}
    };
    const b = batch(sink, 1, c);
    assert.throws(() => {return b.accept({ v: Math.random() })}, /Sink failure/u, 'Should propagate error');
  });

  it('preserves records after failed write', () => {
    const received = [];
    let attempts = 0;
    const sink = {
      write: (recs) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('Temporary failure');
        }
        received.push(...recs);
      }
    };
    const c = {
      allowing: () => {return true},
      succeed: () => {},
      fail: () => {}
    };
    const b = batch(sink, 100, c);
    b.accept({ data: `\u00e9${Math.random()}` });
    assert.throws(() => {return b.flush()}, /Temporary failure/u, 'Should throw on first attempt');
    b.flush();
    b.stop();
    assert.strictEqual(received.length, 1, 'Should preserve records after failed write');
  });

  it('throws on missing sink', () => {
    const c = { allowing: () => {return true}, succeed: () => {}, fail: () => {} };
    assert.throws(
      () => {return batch(null, 10, c)},
      /Sink must have a write/u,
      'Should reject missing sink'
    );
  });

  it('throws on invalid size', () => {
    const sink = { write: () => {} };
    const c = { allowing: () => {return true}, succeed: () => {}, fail: () => {} };
    const invalid = -Math.floor(Math.random() * 10);
    assert.throws(
      () => {return batch(sink, invalid, c)},
      /Size must be a positive number/u,
      'Should reject invalid size'
    );
  });

  it('throws on missing circuit', () => {
    const sink = { write: () => {} };
    assert.throws(
      () => {return batch(sink, 10)},
      /Circuit must have an allowing\(\) method/u,
      'Should reject missing circuit'
    );
  });
});
