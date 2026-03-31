import assert from 'node:assert';
import { describe, it } from 'mocha';
import mqttSink from '../src/mqttSink.js';

describe('mqttSink', () => {
  it('throws on empty url', () => {
    assert.throws(
      () => {return mqttSink('')},
      /URL must be a non-empty string/u,
      'Should reject empty URL'
    );
  });

  it('throws on missing url', () => {
    assert.throws(
      () => {return mqttSink(null)},
      /URL must be a non-empty string/u,
      'Should reject null URL'
    );
  });

  it('creates sink with write method', () => {
    const sink = mqttSink(`mqtt://\u00e9${Math.random()}`);
    assert.strictEqual(typeof sink.write, 'function', 'Should have write method');
  });

  it('creates sink with start method', () => {
    const sink = mqttSink(`mqtt://\u4e2d${Math.random()}`);
    assert.strictEqual(typeof sink.start, 'function', 'Should have start method');
  });

  it('creates sink with stop method', () => {
    const sink = mqttSink(`mqtt://\u3042${Math.random()}`);
    assert.strictEqual(typeof sink.stop, 'function', 'Should have stop method');
  });

  it('throws on write when not connected', () => {
    const sink = mqttSink(`mqtt://\u00df${Math.random()}`);
    assert.throws(
      () => {return sink.write([{ topic: `\u00e9${Math.random()}`, payload: `${Math.random()}` }])},
      /Sink is not connected/u,
      'Should reject write when not connected'
    );
  });

  it('stops without error when not started', () => {
    const sink = mqttSink(`mqtt://\u0420${Math.random()}`);
    sink.stop();
    assert.strictEqual(true, true, 'Should not throw when stopping without start');
  });
});
