import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import serialSource from '../src/serialSource.js';
const pause = (ms = 10) => { return new Promise((resolve) => { setTimeout(resolve, ms); }); };
function port() { const result = new EventEmitter(); result.close = (callback) => { result.emit('close'); callback(); }; return result; }
describe('serialSource', function () {
  it('rejects duplicate paths', function () { assert.throws(() => { serialSource([{ path: '/a' }, { path: '/a' }], { accept() {} }); }, /duplicate/u); });
  it('isolates unavailable devices, retries close, and removes old listeners across restart', async function () {
    const devices = [{ path: '/a' }, { path: '/b' }];
    const opened = [];
    const events = [];
    const errors = [];
    let unavailable = true;
    const source = serialSource(devices, { accept(event) { events.push(event); } }, { retryMs: 5,
      onError(error) { errors.push(error); }, openPort(device) { if (device.path === '/a' && unavailable) { throw new Error('unavailable'); } const item = port(); opened.push({ device, port: item }); return item; }
    });
    await source.start();
    await source.start();
    await pause();
    const healthy = opened.find(({ device }) => { return device.path === '/b'; }).port;
    const chunk = Buffer.from('raw');
    healthy.emit('data', chunk);
    await pause();
    assert.equal(events[0].device, devices[1]);
    assert.equal(events[0].chunk, chunk);
    assert.ok(errors.length > 0);
    unavailable = false;
    healthy.emit('close');
    await pause(30);
    assert.equal(healthy.listenerCount('data'), 0);
    assert.equal(opened.filter(({ device }) => { return device.path === '/b'; }).length, 2);
    await source.stop();
    assert.ok(opened.every(({ port: item }) => { return item.listenerCount('data') === 0; }));
    const count = events.length;
    healthy.emit('data', chunk);
    await source.start();
    await pause();
    assert.equal(events.length, count);
    assert.equal(opened.filter(({ device }) => { return device.path === '/b'; }).length, 3);
    await source.stop();
  });
  it('removes listeners even when a custom port throws while closing', async function () {
    const item = port();
    item.close = () => { throw new Error('close failed'); };
    const source = serialSource([{ path: '/a' }], { accept() {} }, { openPort() { return item; } });
    await source.start();
    await pause();
    await source.stop();
    assert.equal(item.listenerCount('data'), 0);
    assert.equal(item.listenerCount('error'), 0);
    assert.equal(item.listenerCount('close'), 0);
  });
  it('closes a port that finishes opening after stop and cancels immediate start', async function () {
    let finish;
    const item = port();
    const source = serialSource([{ path: '/a' }], { accept() { assert.fail('late delivery'); } }, { openPort() { return new Promise((resolve) => { finish = resolve; }); } });
    await source.start();
    await pause();
    const stopping = source.stop();
    finish(item);
    await stopping;
    assert.equal(item.listenerCount('data'), 0);
    const starting = source.start();
    await source.stop();
    await starting;
  });
});
