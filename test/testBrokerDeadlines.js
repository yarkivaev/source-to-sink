import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import amqpSink from '../src/amqpSink.js';
import amqpSource from '../src/amqpSource.js';
import stompSend from '../src/stompSend.js';

function broker() {
    const channel = Object.assign(new EventEmitter(), {
        assertQueue() { return Promise.resolve({ queue: 'queue' }); }, prefetch() { return Promise.resolve(); },
        consume(queue, callback) { channel.deliver = callback; return Promise.resolve({ consumerTag: 'tag' }); },
        cancel() { return Promise.resolve(); }, ack() { channel.acked = true; }, nack() {},
        close() { return Promise.resolve(); }, publish() { return true; }
    });
    const connection = Object.assign(new EventEmitter(), {
        createChannel() { return Promise.resolve(channel); }, createConfirmChannel() { return Promise.resolve(channel); },
        close() { connection.closed = true; return Promise.resolve(); }
    });
    return { channel, connection };
}
describe('broker operation deadlines', () => {
    it('AMQP stop bounds a hung channel close and quarantines the sink', async () => {
        const fake = broker();
        fake.channel.close = () => { return new Promise(() => {}); };
        const sink = amqpSink('amqp://test', { connect() { return Promise.resolve(fake.connection); }, stopTimeoutMs: 10 });
        await sink.start();
        await assert.rejects(sink.stop(), /timed out/u);
        assert.equal(fake.connection.closed, true);
        await assert.rejects(sink.start(), /timed out/u);
    });
    it('AMQP abort rejects pending confirmation without replay', async () => {
        const fake = broker();
        const sink = amqpSink('amqp://test', { connect() { return Promise.resolve(fake.connection); }, retryMs: 10000 });
        await sink.start();
        const controller = new AbortController();
        const written = sink.write([{ exchange: 'events', routingKey: 'test', body: 'one' }], { signal: controller.signal });
        controller.abort(new Error('revoked'));
        await assert.rejects(written, /revoked/u);
        await sink.stop();
    });
    it('AMQP stop bounds a hung acceptance and does not ACK its late result', async () => {
        const fake = broker();
        let release;
        const source = amqpSource('amqp://test', 'queue', { accept() { return new Promise((resolve) => { release = resolve; }); } }, {
            connect() { return Promise.resolve(fake.connection); }, stopTimeoutMs: 10, onError() {}
        });
        await source.start();
        const pending = fake.channel.deliver({ content: Buffer.from('one'), properties: {}, fields: {} });
        await assert.rejects(source.stop(), /timed out/u);
        release();
        await pending;
        assert.equal(fake.channel.acked, undefined);
        assert.equal(fake.connection.closed, true);
    });
    it('STOMP send waits for receipt and destroys a timed-out client', async () => {
        let receipt;
        const client = {
            on() {}, send(headers, options) { receipt = options?.onReceipt; return { end() {} }; },
            disconnect(callback) { callback(); }, destroy() { client.destroyed = true; }
        };
        let done = false;
        const sent = stompSend('stomp://test', '/queue/test', 'one', {
            connect(params, callback) { callback(null, client); return client; }, timeoutMs: 15
        }).then(() => { done = true; });
        await delay(1);
        assert.equal(done, false);
        assert.equal(typeof receipt, 'function');
        await assert.rejects(sent, /timed out/u);
        assert.equal(client.destroyed, true);
        receipt();
        assert.equal(done, false);
    });
});

it('AMQP restart cannot reauthorize an old delivery while stop drains it', async () => {
    const fake = broker();
    let release;
    const source = amqpSource('amqp://test', 'queue', { accept() { return new Promise((resolve) => { release = resolve; }); } }, {
        connect() { return Promise.resolve(fake.connection); }, onError() {}
    });
    await source.start();
    const pending = fake.channel.deliver({ content: Buffer.from('one'), properties: {}, fields: {} });
    const stopped = source.stop();
    const restarted = source.start();
    release();
    await Promise.all([pending, stopped, restarted]);
    assert.equal(fake.channel.acked, undefined);
    await source.stop();
});

it('AMQP rejects oversized payloads before collector acceptance without requeue', async () => {
    const fake = broker();
    let accepted = 0;
    let requeued;
    fake.channel.nack = (message, all, requeue) => { requeued = requeue; };
    const source = amqpSource('amqp://test', 'queue', { accept() { accepted += 1; } }, {
        connect() { return Promise.resolve(fake.connection); }, maxMessageBytes: 2, onError() {}
    });
    await source.start();
    await fake.channel.deliver({ content: Buffer.from('too large'), properties: {}, fields: {} });
    assert.equal(accepted, 0);
    assert.equal(requeued, false);
    await source.stop();
});

it('two AMQP sources share admission capacity and release it after acceptance', async () => {
    const first = broker();
    const second = broker();
    const usage = { records: 0, bytes: 0 };
    const budget = {
        reserve({ bytes, records }) {
            if (usage.records + records > 1 || usage.bytes + bytes > 3) { throw new Error('shared capacity exceeded'); }
            usage.records += records; usage.bytes += bytes;
            return () => { usage.records -= records; usage.bytes -= bytes; };
        }
    };
    let release;
    let accepted = 0;
    const one = amqpSource('amqp://test', 'one', { accept() { return new Promise((resolve) => { release = resolve; }); } }, {
        budget, connect() { return Promise.resolve(first.connection); }, onError() {}
    });
    const two = amqpSource('amqp://test', 'two', { accept() { accepted += 1; return Promise.reject(new Error('sink failed')); } }, {
        budget, connect() { return Promise.resolve(second.connection); }, onError() {}
    });
    await Promise.all([one.start(), two.start()]);
    const message = { content: Buffer.from('one'), properties: {}, fields: {} };
    const pending = first.channel.deliver(message);
    await second.channel.deliver(message);
    assert.equal(accepted, 0);
    assert.deepEqual(usage, { bytes: 3, records: 1 });
    release();
    await pending;
    await second.channel.deliver(message);
    assert.equal(accepted, 1);
    assert.deepEqual(usage, { bytes: 0, records: 0 });
    await Promise.all([one.stop(), two.stop()]);
});

it('AMQP does not admit deliveries arriving after stop begins', async () => {
    const fake = broker();
    let accepted = 0;
    let cancel;
    fake.channel.cancel = () => { return new Promise((resolve) => { cancel = resolve; }); };
    const source = amqpSource('amqp://test', 'queue', { accept() { accepted += 1; } }, {
        connect() { return Promise.resolve(fake.connection); }, onError() {}
    });
    await source.start();
    const stopping = source.stop();
    await new Promise((resolve) => { setImmediate(resolve); });
    await fake.channel.deliver({ content: Buffer.from('late'), properties: {}, fields: {} });
    cancel();
    await stopping;
    assert.equal(accepted, 0);
});
