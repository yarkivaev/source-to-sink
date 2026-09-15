import assert from 'node:assert';
import { describe, it } from 'mocha';
import follow from '../src/follow.js';

describe('follow', () => {
    it('accepts in subscribe order when the first body is slower', async () => {
        const order = [];
        const first = `ä-${Math.random().toString(16).slice(2)}`;
        const second = `ö-${Math.random().toString(16).slice(2)}`;
        const pause = (ms) => {
            return new Promise((resolve) => {
                setTimeout(resolve, ms);
            });
        };
        const deliver = (body) => {
            order.push(body);
            return Promise.resolve();
        };
        let pending = Promise.resolve();
        pending = follow(pending, () => {
            return pause(40).then(() => {
                return first;
            });
        }, deliver, false);
        pending = follow(pending, () => {
            return Promise.resolve(second);
        }, deliver, false);
        await pending;
        assert.deepStrictEqual(
            order,
            [first, second],
            'a slower first body reordered accept ahead of subscribe'
        );
    });
});
