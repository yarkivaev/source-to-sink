import assert from 'node:assert/strict';
import http from 'node:http';
import lokiSource from '../src/lokiSource.js';

function payload(lines) {
    return { status: 'success', data: { resultType: 'streams', result: [{ values: lines.map((line, index) => {
        return [String(100000000 + index), line];
    }) }] } };
}
async function serverFor(handler) {
    const server = http.createServer(handler);
    await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    return { url: `http://127.0.0.1:${server.address().port}`, async stop() {
        server.closeAllConnections();
        await new Promise((resolve) => { server.close(resolve); });
    } };
}
async function until(check) {
    const end = Date.now() + 500;
    while (!check() && Date.now() < end) { await new Promise((resolve) => { setTimeout(resolve, 5); }); }
    assert.ok(check(), 'condition reached before deadline');
}

describe('Loki bounded reads', function () {
    it('rejects saturated pages without delivering partial rows or advancing the cursor', async function () {
        const starts = [];
        const accepted = [];
        const errors = [];
        let now = 100;
        const server = await serverFor((request, response) => {
            starts.push(new URL(request.url, 'http://localhost').searchParams.get('start'));
            now += 100;
            response.end(JSON.stringify(payload(['first', 'second'])));
        });
        const source = lokiSource(server.url, '{}', 0.01, { accept(record) { accepted.push(record); } }, { millis() { return now; } },
            { pageLimit: 2, queryLagMs: 0, onError(error) { errors.push(error); } });
        try {
            await source.start();
            await until(() => { return starts.length >= 3; });
            assert.equal(accepted.length, 0);
            assert.ok(errors.length >= 2);
            assert.deepEqual([...new Set(starts)], ['100000000']);
        } finally { await server.stop(); await source.stop(); }
    });
    it('queries behind ingestion visibility so an initially invisible log is not skipped', async function () {
        const received = [];
        const timestamp = Date.now() + 30;
        const visibleAt = timestamp + 80;
        const server = await serverFor((request, response) => {
            const params = new URL(request.url, 'http://localhost').searchParams;
            const start = Number(params.get('start')) / 1000000;
            const end = Number(params.get('end')) / 1000000;
            const visible = Date.now() >= visibleAt && timestamp >= start && timestamp <= end;
            response.end(JSON.stringify({ status: 'success', data: { resultType: 'streams',
                result: visible ? [{ values: [[String(timestamp * 1000000), 'late visibility']] }] : [] } }));
        });
        const source = lokiSource(server.url, '{}', 0.02, { accept(record) { received.push(record); } },
            { millis() { return Date.now(); } }, { queryLagMs: 100 });
        try {
            await source.start();
            await new Promise((resolve) => { setTimeout(resolve, 350); });
            assert.equal(received.length, 1);
        } finally { await server.stop(); await source.stop(); }
    });
    it('rejects oversized response bodies before delivery', async function () {
        const accepted = [];
        const errors = [];
        const server = await serverFor((request, response) => { response.end(JSON.stringify(payload(['x'.repeat(2048)]))); });
        const source = lokiSource(server.url, '{}', 0.01, { accept(record) { accepted.push(record); } }, { millis() { return 100; } },
            { maxResponseBytes: 128, onError(error) { errors.push(error); } });
        try {
            await source.start();
            await new Promise((resolve) => { setTimeout(resolve, 80); });
            assert.equal(accepted.length, 0);
            assert.match(errors[0]?.message ?? '', /capacity/u);
        } finally { await server.stop(); await source.stop(); }
    });
    it('aborts an unresponsive HTTP request at the read deadline', async function () {
        let closed = false;
        const server = await serverFor((request) => { request.on('close', () => { closed = true; }); });
        const source = lokiSource(server.url, '{}', 0.01, { accept() {} }, { millis() { return 100; } }, { requestTimeoutMs: 30 });
        try {
            await source.start();
            await until(() => { return closed; });
        } finally { await server.stop(); await source.stop(); }
    });
    it('cancels active HTTP reads when the source stops', async function () {
        let received = false;
        let closed = false;
        const server = await serverFor((request) => { received = true; request.on('close', () => { closed = true; }); });
        const source = lokiSource(server.url, '{}', 0.01, { accept() {} }, { millis() { return 100; } });
        try {
            await source.start();
            await until(() => { return received; });
            const stopping = source.stop();
            await until(() => { return closed; });
            await stopping;
        } finally { await server.stop(); await source.stop(); }
    });
});
