import assert from 'node:assert';
import { describe, it } from 'mocha';
import stompSend from '../src/stompSend.js';

describe('stompSend', () => {
    it('throws on missing url', () => {
        assert.throws(
            () => {
                stompSend(null, '/exchange/test', {});
            },
            /URL must be a non-empty string/u,
            'Should reject missing url'
        );
    });

    it('throws on empty destination', () => {
        assert.throws(
            () => {
                stompSend('stomp://localhost:61613', '', {});
            },
            /Destination must be a non-empty string/u,
            'Should reject empty destination'
        );
    });

    it('returns a promise', () => {
        const pending = stompSend(
            `stomp://\u00e9${Math.random()}:61613`,
            '/exchange/scada.user_decisions',
            { machine: 'x', start: 1, user: 'u', tags: [] }
        );
        assert.strictEqual(typeof pending.then, 'function', 'Should return a promise');
        pending.catch(() => {});
    });
});
