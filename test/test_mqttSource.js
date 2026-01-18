import assert from 'node:assert';
import { describe, it } from 'mocha';
import mqttSource from '../src/mqttSource.js';

function fakeClient() {
  const handlers = {};
  return {
    subscribe: () => {},
    unsubscribe: () => {},
    on: (event, handler) => { handlers[event] = handler; },
    off: (event) => { delete handlers[event]; },
    emit: (event, topic, message) => {
      if (handlers[event]) {
        handlers[event](topic, message);
      }
    },
    handlers: () => handlers
  };
}

describe('mqttSource', () => {
  it('subscribes to topic on start', () => {
    let subscribed = false;
    const client = {
      subscribe: () => { subscribed = true; },
      unsubscribe: () => {},
      on: () => {},
      off: () => {}
    };
    const collector = { accept: () => {} };
    const topic = `topic/${Math.random().toString(36).slice(2)}`;
    const source = mqttSource(client, topic, collector);
    source.start();
    assert.strictEqual(subscribed, true, 'Should subscribe on start');
  });

  it('unsubscribes from topic on stop', () => {
    let unsubscribed = false;
    const client = {
      subscribe: () => {},
      unsubscribe: () => { unsubscribed = true; },
      on: () => {},
      off: () => {}
    };
    const collector = { accept: () => {} };
    const source = mqttSource(client, 'test/topic', collector);
    source.start();
    source.stop();
    assert.strictEqual(unsubscribed, true, 'Should unsubscribe on stop');
  });

  it('forwards messages to collector', () => {
    const received = [];
    const client = fakeClient();
    const collector = { accept: (record) => received.push(record) };
    const topic = 'sensors/temp';
    const source = mqttSource(client, topic, collector);
    source.start();
    const record = { value: Math.random(), unit: `\u00b0C` };
    client.emit('message', topic, Buffer.from(JSON.stringify(record)));
    source.stop();
    assert.strictEqual(received.length, 1, 'Should forward message to collector');
  });

  it('ignores duplicate start calls', () => {
    let count = 0;
    const client = {
      subscribe: () => { count++; },
      unsubscribe: () => {},
      on: () => {},
      off: () => {}
    };
    const collector = { accept: () => {} };
    const source = mqttSource(client, 'test', collector);
    source.start();
    source.start();
    source.stop();
    assert.strictEqual(count, 1, 'Should only subscribe once');
  });

  it('ignores stop when not started', () => {
    let unsubscribed = false;
    const client = {
      subscribe: () => {},
      unsubscribe: () => { unsubscribed = true; },
      on: () => {},
      off: () => {}
    };
    const collector = { accept: () => {} };
    const source = mqttSource(client, 'test', collector);
    source.stop();
    assert.strictEqual(unsubscribed, false, 'Should not unsubscribe when not started');
  });

  it('removes message handler on stop', () => {
    const client = fakeClient();
    const collector = { accept: () => {} };
    const source = mqttSource(client, 'test', collector);
    source.start();
    source.stop();
    assert.strictEqual(client.handlers()['message'], undefined, 'Should remove handler on stop');
  });

  it('throws on missing client', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource(null, 'test', collector),
      /Client must have a subscribe\(\) method/,
      'Should reject missing client'
    );
  });

  it('throws on client without subscribe', () => {
    const client = { on: () => {}, unsubscribe: () => {}, off: () => {} };
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource(client, 'test', collector),
      /Client must have a subscribe\(\) method/,
      'Should reject client without subscribe'
    );
  });

  it('throws on client without on', () => {
    const client = { subscribe: () => {}, unsubscribe: () => {}, off: () => {} };
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource(client, 'test', collector),
      /Client must have an on\(\) method/,
      'Should reject client without on'
    );
  });

  it('throws on client without unsubscribe', () => {
    const client = { subscribe: () => {}, on: () => {}, off: () => {} };
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource(client, 'test', collector),
      /Client must have an unsubscribe\(\) method/,
      'Should reject client without unsubscribe'
    );
  });

  it('throws on client without off', () => {
    const client = { subscribe: () => {}, on: () => {}, unsubscribe: () => {} };
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource(client, 'test', collector),
      /Client must have an off\(\) method/,
      'Should reject client without off'
    );
  });

  it('throws on empty topic', () => {
    const client = { subscribe: () => {}, on: () => {}, unsubscribe: () => {}, off: () => {} };
    const collector = { accept: () => {} };
    assert.throws(
      () => mqttSource(client, '', collector),
      /Topic must be a non-empty string/,
      'Should reject empty topic'
    );
  });

  it('throws on missing collector', () => {
    const client = { subscribe: () => {}, on: () => {}, unsubscribe: () => {}, off: () => {} };
    assert.throws(
      () => mqttSource(client, 'test', null),
      /Collector must have an accept\(\) method/,
      'Should reject missing collector'
    );
  });
});
