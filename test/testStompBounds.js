import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import stompit from 'stompit';
import stompSource from '../src/stompSource.js';

function frame(chunks) {
    const stream = Readable.from(chunks);
    stream.readString = (encoding, callback) => {
        let body = '';
        stream.on('data', (chunk) => { body += chunk.toString(); });
        stream.on('end', () => { callback(null, body); });
    };
    return stream;
}
async function fixture(run) {
    const original = stompit.Channel;
    const channels = [];
    stompit.Channel = function Channel() {
        const channel = { subscribe(headers, callback) { channel.receive = callback; }, close() {}, ack() {}, nack() {} };
        channels.push(channel);
        return channel;
    };
    try { await run(channels); }
    finally {
        // Restore the native driver boundary after all deliveries settle.
        // eslint-disable-next-line require-atomic-updates
        stompit.Channel = original;
    }
}
describe('STOMP byte and shared admission bounds', () => {
    it('rejects oversized streamed bodies before accepting them', async () => {
        await fixture(async (channels) => {
            let accepted = 0;
            const errors = [];
            const source = stompSource('stomp://test', '/queue/test', { accept() { accepted += 1; } }, {
                maxMessageBytes: 3, onError(error) { errors.push(error); }
            });
            source.start();
            channels[0].receive(null, frame([Buffer.from('one'), Buffer.from('two')]));
            await delay(10);
            assert.equal(accepted, 0);
            assert.match(errors[0]?.message || '', /capacity/u);
            await assert.rejects(source.stop(), /capacity/u);
        });
    });
    it('shares admission between sources and releases only on actual acceptance', async () => {
        await fixture(async (channels) => {
            let reserved = 0;
            const budget = { reserve() {
                if (reserved) { throw new Error('shared capacity exceeded'); }
                reserved += 1;
                return () => { reserved -= 1; };
            } };
            let release;
            let accepted = 0;
            const first = stompSource('stomp://test', '/queue/one', { accept() { return new Promise((resolve) => { release = resolve; }); } }, { budget });
            const second = stompSource('stomp://test', '/queue/two', { accept() { accepted += 1; } }, { budget });
            first.start(); second.start();
            channels[0].receive(null, frame([Buffer.from('one')]));
            await delay(5);
            channels[1].receive(null, frame([Buffer.from('two')]));
            await delay(5);
            assert.equal(accepted, 0);
            assert.equal(reserved, 1);
            release();
            await delay(5);
            assert.equal(reserved, 0);
            channels[1].receive(null, frame([Buffer.from('two')]));
            await delay(5);
            assert.equal(accepted, 1);
            assert.equal(reserved, 0);
            await Promise.all([first.stop(), second.stop()]);
        });
    });
});
