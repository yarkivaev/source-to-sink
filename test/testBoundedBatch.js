import assert from 'node:assert/strict';
import boundedBatch from '../src/boundedBatch.js';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

describe('bounded durable batch', () => {
    it('acknowledges accept only after sink completion, including a partial batch', async () => {
        const gate = deferred();
        const writes = [];
        const collector = boundedBatch({ write(rows) { writes.push(rows); return gate.promise; } }, { size: 10, maxWaitMs: 5 });
        let accepted = false;
        const pending = collector.accept({ id: 1 }).then(() => { accepted = true; });
        await new Promise(resolve => { setTimeout(resolve, 20); });
        assert.deepEqual(writes, [[{ id: 1 }]]);
        assert.equal(accepted, false);
        gate.resolve();
        await pending;
        await collector.stop();
    });
    it('bounds admission including in-flight records and never overlaps writes', async () => {
        const gate = deferred();
        const writes = [];
        const collector = boundedBatch({ write(rows) { writes.push(rows); return gate.promise; } }, { size: 1, maxRecords: 2 });
        const first = collector.accept('one');
        const second = collector.accept('two');
        await assert.rejects(collector.accept('three'), /capacity/u);
        await new Promise(resolve => { setImmediate(resolve); });
        assert.equal(writes.length, 1);
        gate.resolve();
        await Promise.all([first, second]);
        assert.deepEqual(writes, [['one'], ['two']]);
        await collector.stop();
    });
    it('rejects oversized records without writing and releases capacity after failure', async () => {
        let fail = true;
        const collector = boundedBatch({ write() { if (fail) { throw new Error('offline'); } } }, { size: 1, maxBytes: 8 });
        await assert.rejects(collector.accept('0123456789'), /capacity/u);
        await assert.rejects(collector.accept('x'), /offline/u);
        fail = false;
        await collector.accept('y');
        await collector.stop();
    });
    it('reports a timer flush error to acceptance without an uncaught exception', async () => {
        const collector = boundedBatch({ write() { throw new Error('offline'); } }, { size: 5, maxWaitMs: 1 });
        await assert.rejects(collector.accept('x'), /offline/u);
        await collector.stop();
    });
    it('drains on stop and rejects admission after stopping', async () => {
        const rows = [];
        const collector = boundedBatch({ write(items) { rows.push(...items); } }, { size: 5 });
        const pending = collector.accept('x');
        await collector.stop();
        await pending;
        assert.deepEqual(rows, ['x']);
        await assert.rejects(collector.accept('y'), /stopped/u);
    });
    it('bounds a stuck write and forwards cancellation to the sink', async () => {
        let aborted = false;
        const collector = boundedBatch({ write(rows, { signal }) {
            signal.addEventListener('abort', () => { aborted = true; });
            return new Promise(() => {});
        } }, { size: 1, writeTimeoutMs: 5 });
        await assert.rejects(collector.accept('x'), /timed out/u);
        assert.equal(aborted, true);
        await assert.rejects(collector.accept('y'), /failed/u);
        await collector.stop();
    });
});

it('boundedBatch flush surfaces an in-flight sink failure', async () => {
    const collector = boundedBatch({ write() { return Promise.reject(new Error('write failed')); } }, { size: 10 });
    const accepted = assert.rejects(collector.accept('one'), /write failed/u);
    await assert.rejects(collector.flush(), /write failed/u);
    await accepted;
});

it('boundedBatch reserves queued records and retains timed-out write leases until actual completion', async () => {
    const write = deferred();
    const usage = { records: 0, bytes: 0 };
    const budget = {
        reserve({ bytes, records }) {
            if (usage.records + records > 1) { throw new Error('shared capacity exceeded'); }
            usage.bytes += bytes; usage.records += records;
            return () => { usage.bytes -= bytes; usage.records -= records; };
        }
    };
    const collector = boundedBatch({ write() { return write.promise; } }, { size: 10, writeTimeoutMs: 10, budget });
    const accepted = assert.rejects(collector.accept('one'), /timed out/u);
    assert.deepEqual(usage, { records: 1, bytes: 5 });
    await assert.rejects(collector.accept('two'), /capacity/u);
    await assert.rejects(collector.flush(), /timed out/u);
    await accepted;
    assert.equal(usage.records, 1);
    write.resolve();
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(usage, { records: 0, bytes: 0 });
    await collector.stop();
});
