import assert from 'node:assert/strict';
import intervalSource from '../src/intervalSource.js';

it('interval stop aborts acceptance and quarantines a collector that does not settle', async () => {
    let signal;
    const source = intervalSource(1, { accept(event, context) { signal = context?.signal; return new Promise(() => {}); } }, {
        immediate: true, stopTimeoutMs: 10, acceptTimeoutMs: 30
    });
    const starting = source.start();
    await new Promise((resolve) => { setImmediate(resolve); });
    await assert.rejects(source.stop(), /timed out/u);
    assert.equal(signal.aborted, true);
    await assert.rejects(source.start(), /timed out/u);
    await starting;
});

it('interval start still works after an acceptance timeout', async () => {
    let ticks = 0;
    const source = intervalSource(1, {
        accept() {
            ticks += 1;
            return ticks === 1 ? new Promise(() => {}) : Promise.resolve();
        }
    }, { immediate: true, acceptTimeoutMs: 15 });
    await source.start();
    await source.stop();
    await source.start();
    await source.stop();
    assert.ok(ticks >= 2, 'source stayed dead after an acceptance timeout');
});

it('interval keeps ticking after an acceptance timeout', async () => {
    const errors = [];
    const scheduled = [];
    let ticks = 0;
    const source = intervalSource(10, {
        accept() {
            ticks += 1;
            return ticks === 1 ? new Promise(() => {}) : Promise.resolve();
        }
    }, {
        immediate: true,
        acceptTimeoutMs: 15,
        onError(error) { errors.push(error); },
        schedule(callback) { scheduled.push(callback); return callback; },
        clear() {}
    });
    await source.start();
    await new Promise((resolve) => { setTimeout(resolve, 40); });
    assert.equal(errors[0]?.code, 'OPERATION_TIMEOUT');
    assert.equal(scheduled.length, 1, 'timeout stopped the interval');
    scheduled.shift()();
    await new Promise((resolve) => { setImmediate(resolve); });
    const count = ticks;
    await source.stop();
    assert.equal(count, 2, 'source did not accept another tick after timeout');
});
