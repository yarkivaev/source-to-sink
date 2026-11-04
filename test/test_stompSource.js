import assert from 'node:assert';
import { describe, it } from 'mocha';
import stompSource from '../src/stompSource.js';
import stompit from 'stompit';

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

  it('accepts manualAck and serial options without throwing', () => {
    const collector = { accept: () => {} };
    const source = stompSource('stomp://localhost:61613', '/queue/test', collector, {
      manualAck: true,
      serial: false
    });
    assert.strictEqual(typeof source.start, 'function', 'manualAck source missing start');
  });
});

/**
 * Captures the protocol headers using an inert channel.
 *
 * @param {object} options - Source options
 * @returns {object} SUBSCRIBE headers
 */
function subscription(options) {
  const original = stompit.Channel;
  let headers;
  stompit.Channel = function Channel() {
    return {
      subscribe(value) { headers = value; },
      close() { return undefined; }
    };
  };
  try {
    const source = stompSource('stomp://localhost:61613', '/queue/backlog', {
      accept() { return undefined; }
    }, options);
    source.start();
    source.stop();
    return headers;
  } finally {
    stompit.Channel = original;
  }
}

describe('STOMP delivery window', function() {
  it('bounds the default backlog without changing acknowledgements', function() {
    assert.deepStrictEqual(subscription({ manualAck: true, serial: false }), {
      destination: '/queue/backlog',
      ack: 'client-individual',
      'prefetch-count': '32'
    });
  });

  it('sends a configured finite delivery window', function() {
    const prefetch = Math.floor(Math.random() * 100) + 1;
    assert.strictEqual(subscription({ prefetch })['prefetch-count'], String(prefetch));
  });

  for (const prefetch of [0, -1, 1.5, Infinity, NaN, '32']) {
    it(`rejects invalid prefetch ${prefetch}`, function() {
      assert.throws(function() {
        stompSource('stomp://localhost:61613', '/queue/backlog', {
          accept() { return undefined; }
        }, { prefetch });
      }, /prefetch must be a positive safe integer/u);
    });
  }
});


describe('STOMP dead lettering', function() {
  it('sends requeue=false for a rejected poison message', async function() {
    const original = stompit.Channel;
    let receive;
    let headers;
    stompit.Channel = function Channel() {
      return {
        subscribe(value, callback) { receive = callback; },
        nack(message, value) { headers = value; },
        close() {}
      };
    };
    try {
      const source = stompSource('stomp://localhost:61613', '/queue/test', {
        accept({ settle }) { settle.nack(false); }
      }, { manualAck: true });
      source.start();
      receive(null, { readString(encoding, callback) { callback(null, '{}'); } });
      await new Promise((resolve) => { setImmediate(resolve); });
      source.stop();
      assert.deepStrictEqual(headers, { requeue: 'false' });
    } finally {
      // Test restores its synchronous module stub after delivery completes.
      // eslint-disable-next-line require-atomic-updates
      stompit.Channel = original;
    }
  });
});

describe('STOMP shutdown fencing', function() {
  it('does not acknowledge a late acceptance after stop', async function() {
    const original = stompit.Channel;
    let receive;
    let release;
    let acknowledgements = 0;
    stompit.Channel = function Channel() {
      return {
        subscribe(headers, callback) { receive = callback; }, close() {},
        ack() { acknowledgements += 1; }, nack() {}
      };
    };
    try {
      const source = stompSource('stomp://localhost', '/queue/test', {
        accept() { return new Promise((resolve) => { release = resolve; }); }
      }, { stopTimeoutMs: 10 });
      source.start();
      receive(null, { readString(encoding, callback) { callback(null, 'one'); } });
      await new Promise((resolve) => { setImmediate(resolve); });
      await assert.rejects(source.stop(), /timed out/u);
      release();
      await new Promise((resolve) => { setImmediate(resolve); });
      assert.strictEqual(acknowledgements, 0);
    } finally {
      // Restore the dependency boundary stub after delivery settles.
      // eslint-disable-next-line require-atomic-updates
      stompit.Channel = original;
    }
  });
});
