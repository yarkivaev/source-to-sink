import assert from 'node:assert/strict';
import pollingSource from '../src/pollingSource.js';

const wait = ms => { return new Promise(resolve => { setTimeout(resolve, ms); }); };
describe('serialized polling lifecycle', () => {
    it('does not overlap slow fetches or advance the cursor on failure', async () => {
        const ranges = [];
        let now = 10;
        const source = pollingSource(async (since, until) => {
            ranges.push([since, until]);
            await wait(20);
            throw new Error('offline');
        }, 0.005, { accept() {} }, { millis() { now += 1; return now; } });
        source.start();
        await wait(16);
        assert.equal(ranges.length, 1);
        await wait(28);
        await source.stop();
        assert.equal(ranges[0][0], ranges[1][0]);
    });
    it('does not deliver a late read after stop', async () => {
        const received = [];
        const source = pollingSource(async () => { await wait(20); return ['late']; }, 0.001,
            { accept(value) { received.push(value); } }, { millis() { return 1; } });
        source.start();
        await wait(5);
        await source.stop();
        await wait(25);
        assert.deepEqual(received, []);
    });
});
