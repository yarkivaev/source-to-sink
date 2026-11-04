import assert from 'node:assert/strict';
import intervalSource from '../src/intervalSource.js';
const turn = () => { return new Promise((resolve) => { setImmediate(resolve); }); };
describe('intervalSource', function () {
  it('serializes acceptance across stop and restart and cancels stale callbacks', async function () {
    const scheduled = [];
    const cleared = [];
    let release;
    const events = [];
    const source = intervalSource(10, { accept(event) { events.push(event); return new Promise((resolve) => { release = resolve; }); } }, {
      schedule(callback) { scheduled.push(callback); return callback; }, clear(handle) { cleared.push(handle); }
    });
    await source.start();
    const old = scheduled.shift();
    old();
    await turn();
    assert.equal(events.length, 1);
    assert.equal(typeof events[0].ts, 'number');
    assert.equal(scheduled.length, 0);
    const stopped = source.stop();
    const restarted = source.start();
    old();
    await turn();
    assert.equal(events.length, 1);
    release();
    await Promise.all([stopped, restarted]);
    assert.equal(scheduled.length, 1);
    const stale = scheduled.shift();
    await source.stop();
    stale();
    await turn();
    assert.equal(events.length, 1);
    assert.ok(cleared.includes(stale));
  });
  it('awaits the immediate acceptance before start resolves', async function () {
    let release;
    let started = false;
    const source = intervalSource(1000, { accept() { return new Promise((resolve) => { release = resolve; }); } }, { immediate: true });
    const starting = source.start().then(() => { started = true; });
    await turn();
    try {
      assert.equal(started, false);
    } finally {
      release();
      await starting;
      await source.stop();
    }
  });
  it('reports rejected ticks and keeps scheduling', async function () {
    const errors = [];
    const scheduled = [];
    const failure = new Error('sink unavailable');
    const source = intervalSource(10, { accept() { return Promise.reject(failure); } }, {
      immediate: true, onError(error) { errors.push(error); }, schedule(callback) { scheduled.push(callback); }, clear() {}
    });
    await source.start();
    await turn();
    assert.deepEqual(errors, [failure]);
    assert.equal(scheduled.length, 1);
    await source.stop();
  });
});
