import assert from 'node:assert';
import { describe, it } from 'mocha';
import { modbusRtuSource } from '../src/modbusSource.js';
import fakeClock from './fakeClock.js';

describe('modbusRtuSource', () => {
  it('throws on empty serial path', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusRtuSource('', { baudRate: 9600 }, 4000, 44, 5, collector, clk)},
      /Serial path must be a non-empty string/u,
      'Should reject empty serial path'
    );
  });

  it('throws on invalid baud rate', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    assert.throws(
      () => {return modbusRtuSource('/dev/ttyUSB0', { baudRate: 0 }, 4000, 44, 5, collector, clk)},
      /Baud rate must be a positive number/u,
      'Should reject zero baud rate'
    );
  });

  it('creates source with start method', () => {
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = modbusRtuSource(`/dev/ttyUSB${Math.floor(Math.random() * 9)}`, { baudRate: 9600 }, 4000, 44, 5, collector, clk);
    assert.strictEqual(typeof source.start, 'function', 'Should expose start method for RTU source');
  });

  it('retries connection on failure', async () => {
    let logged = false;
    const log = { error: () => { logged = true; } };
    const collector = { accept: () => {} };
    const clk = fakeClock(Math.floor(Math.random() * 10000));
    const source = modbusRtuSource(`/dev/tty\u044b${Math.random()}`, { baudRate: 9600 }, 4000, 44, 5, collector, clk, log);
    source.start();
    await new Promise(resolve => { setTimeout(resolve, 200); });
    source.stop();
    assert.strictEqual(logged, true, 'Should log RTU connection failure and retry');
  });
});
