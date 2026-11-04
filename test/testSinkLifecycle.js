import assert from 'node:assert/strict';
import clickhouseSink from '../src/clickhouseSink.js';
import postgresSink from '../src/postgresSink.js';

it('ClickHouse forwards native cancellation and closes its owned client once', async () => {
    let inserted;
    let closed = 0;
    const client = {
        insert(params) { inserted = params; return Promise.resolve(); },
        close() { closed += 1; return Promise.resolve(); }
    };
    const sink = clickhouseSink('http://localhost:8123', 'metrics', { createClient() { return client; } });
    const controller = new AbortController();
    await sink.write([{ value: 1 }], { signal: controller.signal });
    assert.equal(inserted.abort_signal, controller.signal);
    await Promise.all([sink.stop(), sink.stop()]);
    assert.equal(closed, 1);
    await assert.rejects(sink.write([{ value: 2 }]), /stopped/u);
});
it('Postgres closes a factory-owned pool once', async () => {
    let closed = 0;
    const sink = postgresSink('postgresql://localhost/db', 'metrics', ['value'], {
        createPool() { return { end() { closed += 1; return Promise.resolve(); } }; }
    });
    await Promise.all([sink.stop(), sink.stop()]);
    assert.equal(closed, 1);
    await assert.rejects(sink.write([{ value: 2 }]), /stopped/u);
});
it('Postgres leaves an injected borrowed pool open', async () => {
    let closed = 0;
    const sink = postgresSink('postgresql://localhost/db', 'metrics', ['value'], {
        pool: { end() { closed += 1; return Promise.resolve(); } }
    });
    await sink.stop();
    assert.equal(closed, 0);
});
