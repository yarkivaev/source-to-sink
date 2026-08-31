import assert from 'node:assert';
import net from 'node:net';
import { describe, it } from 'mocha';
import modbusSource from '../src/modbusSource.js';
import fakeClock from './fakeClock.js';

/**
 * TCP listener that counts concurrent sockets on an ephemeral port.
 *
 * @returns {Promise<object>} Gate with port, live, peak, close
 */
function countingListen() {
    let live = 0;
    let peak = 0;
    const sockets = new Set();
    const server = net.createServer((sock) => {
        live += 1;
        if (live > peak) {
            peak = live;
        }
        sockets.add(sock);
        sock.on('close', () => {
            sockets.delete(sock);
            live -= 1;
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({
                port: server.address().port,
                live() {
                    return live;
                },
                peak() {
                    return peak;
                },
                close() {
                    for (const sock of sockets) {
                        sock.destroy();
                    }
                    return new Promise((done) => {
                        server.close(done);
                    });
                }
            });
        });
    });
}

/**
 * Resolves after the given delay.
 *
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise<void>} Timer promise
 */
function settle(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Waits until probe is true or the timeout elapses.
 *
 * @param {Function} probe - Condition
 * @param {number} limit - Timeout in milliseconds
 * @returns {Promise<void>} Resolves when probe holds
 */
function until(probe, limit) {
    const deadline = Date.now() + limit;
    function tick(resolve, reject) {
        if (probe()) {
            resolve();
            return;
        }
        if (Date.now() >= deadline) {
            reject(new Error('condition did not hold before timeout'));
            return;
        }
        setTimeout(() => {
            tick(resolve, reject);
        }, 20);
    }
    return new Promise(tick);
}

describe('modbusSource', () => {
  it('throws on empty host', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusSource('', 502, 4000, 14, 5, collector, clk)},
      /Host must be a non-empty string/u,
      'Should reject empty host'
    );
  });

  it('throws on missing host', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusSource(null, 502, 4000, 14, 5, collector, clk)},
      /Host must be a non-empty string/u,
      'Should reject null host'
    );
  });

  it('throws on invalid port', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusSource('192.168.2.148', -1, 4000, 14, 5, collector, clk)},
      /Port must be a positive number/u,
      'Should reject negative port'
    );
  });

  it('throws on negative address', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusSource('192.168.2.148', 502, -1, 14, 5, collector, clk)},
      /Address must be a non-negative number/u,
      'Should reject negative address'
    );
  });

  it('throws on invalid count', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusSource('192.168.2.148', 502, 4000, 0, 5, collector, clk)},
      /Count must be a positive number/u,
      'Should reject zero count'
    );
  });

  it('throws on missing collector', () => {
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusSource('192.168.2.148', 502, 4000, 14, 5, null, clk)},
      /Collector must have an accept\(\) method/u,
      'Should reject null collector'
    );
  });

  it('throws on missing clock', () => {
    const collector = { accept: () => {} };
    assert.throws(
      () => {return modbusSource('192.168.2.148', 502, 4000, 14, 5, collector, null)},
      /Clock must have a millis\(\) method/u,
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

  it('retries connection on failure', async () => {
    let logged = false;
    const log = { error: () => { logged = true; } };
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const port = 65000 + Math.floor(Math.random() * 500);
    const source = modbusSource('127.0.0.1', port, 4000, 14, 5, collector, clk, log);
    source.start();
    await new Promise(resolve => { setTimeout(resolve, 200); });
    source.stop();
    assert.strictEqual(logged, true, 'Should log connection failure and retry');
  });

  it('does not crash process on connection failure', async () => {
    const log = { error: () => {} };
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const port = 65000 + Math.floor(Math.random() * 500);
    const source = modbusSource('127.0.0.1', port, 4000, 14, 5, collector, clk, log);
    source.start();
    await new Promise(resolve => { setTimeout(resolve, 200); });
    source.stop();
    assert.strictEqual(true, true, 'Should not crash on unreachable host');
  });

  it('does not open a second TCP socket when start is called twice', async function() {
    const gate = await countingListen();
    const source = modbusSource(
      '127.0.0.1',
      gate.port,
      4000,
      14,
      5,
      { accept() {} },
      fakeClock(1 + Math.floor(Math.random() * 100)),
      { error() {} }
    );
    source.start();
    await until(() => {
      return gate.live() >= 1;
    }, 2000);
    source.start();
    await settle(150);
    const peak = gate.peak();
    source.stop();
    await gate.close();
    assert.strictEqual(peak, 1, 'second start opened another Modbus TCP socket');
  });

  it('closes the TCP socket when stop is called after connect', async function() {
    const gate = await countingListen();
    const source = modbusSource(
      '127.0.0.1',
      gate.port,
      4000,
      14,
      5,
      { accept() {} },
      fakeClock(3 + Math.floor(Math.random() * 100)),
      { error() {} }
    );
    source.start();
    await until(() => {
      return gate.live() >= 1;
    }, 2000);
    source.stop();
    await until(() => {
      return gate.live() === 0;
    }, 2000);
    const live = gate.live();
    await gate.close();
    assert.strictEqual(live, 0, 'stop after connect left a Modbus TCP socket open');
  });

  it('does not keep a TCP socket when stop is called during connect', async function() {
    const gate = await countingListen();
    const source = modbusSource(
      '127.0.0.1',
      gate.port,
      4000,
      14,
      5,
      { accept() {} },
      fakeClock(7 + Math.floor(Math.random() * 100)),
      { error() {} }
    );
    source.start();
    source.stop();
    await settle(400);
    const live = gate.live();
    await gate.close();
    assert.strictEqual(live, 0, 'stop during connect left a Modbus TCP socket open');
  });
});
