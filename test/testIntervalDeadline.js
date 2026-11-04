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

it('interval reports an already-expired acceptance deadline from stop', async () => {
    const source = intervalSource(1, { accept() { return new Promise(() => {}); } }, { immediate: true, acceptTimeoutMs: 10 });
    await source.start();
    await assert.rejects(source.stop(), /timed out/u);
});
