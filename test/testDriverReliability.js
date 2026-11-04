import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import mqttSink from '../src/mqttSink.js';
import mqttSource from '../src/mqttSource.js';
import serialSource from '../src/serialSource.js';
import modbusRtuBusSource from '../src/modbusRtuBusSource.js';

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}
function mqttClient() {
    const client = new EventEmitter();
    client.end = (force, options, callback) => { client.ended = true; callback?.(); };
    client.subscribe = () => {};
    client.unsubscribe = () => {};
    return client;
}

describe('driver reliability', () => {
    it('MQTT start waits for CONNACK and write waits for confirmation', async () => {
        const client = mqttClient();
        let confirm;
        client.publish = (topic, payload, options, callback) => { confirm = callback; };
        const sink = mqttSink('mqtt://test', { connect: () => { return client; }, qos: 1 });
        let started = false;
        const starting = Promise.resolve(sink.start()).then(() => { started = true; });
        await delay(1);
        assert.equal(started, false);
        client.emit('connect');
        await starting;
        let written = false;
        const writing = sink.write([{ topic: 'test', payload: 'one' }]).then(() => { written = true; });
        await delay(1);
        assert.equal(written, false);
        confirm();
        await writing;
        await sink.stop();
    });
    it('MQTT enforces pending capacity and retires an unconfirmed connection', async () => {
        const client = mqttClient();
        client.publish = () => {};
        const sink = mqttSink('mqtt://test', { connect: () => { return client; }, qos: 1, maxPending: 1, confirmTimeoutMs: 15 });
        const starting = sink.start();
        client.emit('connect');
        await starting;
        const writing = assert.rejects(sink.write([{ topic: 'test', payload: 'one' }]), /timed out/u);
        await assert.rejects(sink.write([{ topic: 'test', payload: 'two' }]), /capacity/u);
        await writing;
        assert.equal(client.ended, true);
        await sink.stop();
    });
    it('MQTT acceptance completes before ACK and ignores late acceptance after stop', async () => {
        const client = mqttClient();
        const accepted = deferred();
        const source = mqttSource('mqtt://test', 'test/#', { accept() { return accepted.promise; } }, { connect: () => { return client; } });
        source.start();
        let acknowledged = false;
        client.handleMessage({ topic: 'test/a', payload: Buffer.from('one') }, (error) => { acknowledged = !error; });
        await delay(1);
        assert.equal(acknowledged, false);
        source.stop();
        accepted.resolve();
        await delay(1);
        assert.equal(acknowledged, false);
    });
    it('serial pauses during acceptance and bounds an uncooperative producer', async () => {
        const port = new EventEmitter();
        port.pause = () => { port.paused = true; };
        port.resume = () => { port.paused = false; };
        port.close = (callback) => { port.closed = true; callback(); };
        const accepted = deferred();
        const errors = [];
        let calls = 0;
        const source = serialSource([{ path: '/test' }], { accept() { calls += 1; return accepted.promise; } }, {
            openPort: () => { return Promise.resolve(port); }, maxPending: 1, retryMs: 1000,
            onError(error) { errors.push(error); }
        });
        await source.start();
        await delay(1);
        port.emit('data', Buffer.from('a'));
        await delay(1);
        assert.equal(port.paused, true);
        port.emit('data', Buffer.from('b'));
        await delay(1);
        assert.equal(calls, 1);
        assert.match(errors[0]?.message || '', /capacity/u);
        accepted.resolve();
        await assert.rejects(source.stop(), /capacity/u);
        assert.equal(port.closed, true);
    });
    it('RTU waits for a read and acceptance before polling again and continues past a bad slave', async () => {
        const read = deferred();
        const ids = [];
        const client = {
            connectRTUBuffered() { return Promise.resolve(); }, setTimeout() {},
            setID(slave) { ids.push(slave); },
            readHoldingRegisters() { if (ids.length === 1) { return Promise.reject(new Error('bad slave')); } return read.promise; },
            close(callback) { callback?.(); }
        };
        const source = modbusRtuBusSource('/test', { baudRate: 9600 }, [1, 2].map((slaveId) => {
            return { slaveId, collector: { accept() {} } };
        }), { address: 0, count: 1, interval: 0.005, createClient: () => { return client; }, log: { error() {} } });
        source.start();
        await delay(25);
        assert.deepEqual(ids, [1, 2]);
        const stopping = source.stop();
        read.resolve({ data: [1] });
        await stopping;
        await delay(10);
        assert.deepEqual(ids, [1, 2]);
    });
});

describe('driver shutdown deadlines', () => {
    it('serial stop rejects a hung open and closes its eventual handle without reopening', async () => {
        const opening = deferred();
        let opens = 0;
        let closes = 0;
        const source = serialSource([{ path: '/test' }], { accept() {} }, {
            openPort() { opens += 1; return opening.promise; }, openTimeoutMs: 50, stopTimeoutMs: 10, retryMs: 1
        });
        await source.start();
        await assert.rejects(source.stop(), /timed out/u);
        opening.resolve(Object.assign(new EventEmitter(), { close(callback) { closes += 1; callback(); } }));
        await delay(10);
        await assert.rejects(source.start(), /timed out/u);
        assert.equal(opens, 1);
        assert.ok(closes >= 1);
    });
    it('RTU closes a late connection after stop and never polls it', async () => {
        const opening = deferred();
        let reads = 0;
        let closes = 0;
        const client = {
            connectRTUBuffered() { return opening.promise; }, setTimeout() {}, setID() {},
            readHoldingRegisters() { reads += 1; return Promise.resolve({ data: [] }); }, close(callback) { closes += 1; callback(); }
        };
        const source = modbusRtuBusSource('/test', { baudRate: 9600 }, [{ slaveId: 1, collector: { accept() {} } }], {
            address: 0, count: 1, interval: 0.001, stopTimeoutMs: 10, createClient() { return client; }
        });
        await source.start();
        await assert.rejects(source.stop(), /timed out/u);
        const before = closes;
        opening.resolve();
        await delay(10);
        assert.equal(reads, 0);
        assert.ok(closes > before, 'the now-open late handle must be closed');
    });
    it('MQTT clean stop allows a fresh connection and connect failure rejects promptly', async () => {
        const current = { client: mqttClient() };
        const sink = mqttSink('mqtt://test', { connect() { return current.client; } });
        const starting = sink.start();
        current.client.emit('connect');
        await starting;
        await sink.stop();
        Object.assign(current, { client: mqttClient() });
        const restarting = sink.start();
        await delay(1);
        current.client.emit('error', new Error('unavailable'));
        await assert.rejects(restarting, /unavailable/u);
        await sink.stop();
    });
});

it('MQTT bounds in-flight payload bytes before publishing', async () => {
    const client = mqttClient();
    let sent = 0;
    client.publish = () => { sent += 1; };
    const sink = mqttSink('mqtt://test', { connect() { return client; }, maxPendingBytes: 2 });
    const starting = sink.start();
    client.emit('connect');
    await starting;
    await assert.rejects(sink.write([{ topic: 'a', payload: 'large' }]), /capacity/u);
    assert.equal(sent, 0);
    await sink.stop();
});

it('RTU stop reports an already-expired read deadline', async () => {
    const client = {
        connectRTUBuffered() { return Promise.resolve(); }, setTimeout() {}, setID() {},
        readHoldingRegisters() { return new Promise(() => {}); }, close(callback) { callback(); }
    };
    const source = modbusRtuBusSource('/test', { baudRate: 9600 }, [{ slaveId: 1, collector: { accept() {} } }], {
        address: 0, count: 1, interval: 0.001, readTimeoutMs: 10, createClient() { return client; }
    });
    await source.start();
    await delay(20);
    await assert.rejects(source.stop(), /timed out/u);
});

it('serial close failure quarantines the port instead of reopening it', async () => {
    const port = Object.assign(new EventEmitter(), { close(callback) { callback(new Error('close failed')); } });
    let opens = 0;
    const source = serialSource([{ path: '/test' }], { accept() {} }, {
        openPort() { opens += 1; return Promise.resolve(port); }, retryMs: 1
    });
    await source.start();
    await delay(1);
    port.emit('error', new Error('port failure'));
    await delay(10);
    await assert.rejects(source.stop(), /close failed/u);
    assert.equal(opens, 1);
});

it('MQTT timeout retains the shared lease until actual acceptance settles', async () => {
    const client = mqttClient();
    const accepted = deferred();
    let retained = 0;
    const source = mqttSource('mqtt://test', 'test', { accept() { return accepted.promise; } }, {
        connect() { return client; }, acceptTimeoutMs: 10, stopTimeoutMs: 10,
        budget: { reserve() { retained += 1; return () => { retained -= 1; }; } }
    });
    source.start();
    client.handleMessage({ topic: 'test', payload: Buffer.from('one') }, () => {});
    await delay(20);
    assert.equal(retained, 1);
    await assert.rejects(source.stop(), /timed out/u);
    assert.equal(retained, 1);
    accepted.resolve();
    await delay(1);
    assert.equal(retained, 0);
    await source.stop();
});

it('RTU concurrent restarts open only one new bus generation', async () => {
    let opens = 0;
    const source = modbusRtuBusSource('/test', { baudRate: 9600 }, [{ slaveId: 1, collector: { accept() {} } }], {
        address: 0, count: 1, interval: 60,
        createClient() {
            opens += 1;
            return {
                connectRTUBuffered() { return Promise.resolve(); }, setTimeout() {}, setID() {},
                readHoldingRegisters() { return Promise.resolve({ data: [1] }); }, close(callback) { callback(); }
            };
        }
    });
    await source.start();
    await source.stop();
    await Promise.all([source.start(), source.start()]);
    await source.stop();
    assert.equal(opens, 2);
});
