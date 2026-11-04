import { begin, closeLive } from './amqpSink/session.js';
import publication from './amqpSink/publication.js';

function settings(url, options) {
    if (typeof url !== 'string' || !/^amqps?:\/\//u.test(url)) { throw new TypeError('AMQP URL is required'); }
    const config = { retryMs: 1000, connectTimeoutMs: 5000, confirmTimeoutMs: 10000, maxPending: 1024, ...options };
    ['retryMs', 'connectTimeoutMs', 'confirmTimeoutMs', 'maxPending'].forEach((name) => {
        if (!Number.isFinite(config[name]) || config[name] <= 0) { throw new TypeError(`${name} must be positive`); }
    });
    if (!Number.isInteger(config.maxPending)) { throw new TypeError('maxPending must be an integer'); }
    return config;
}
function stop(state) {
    state.request += 1;
    state.epoch += 1;
    state.wanted = false;
    clearTimeout(state.retry);
    state.retry = null;
    const { live } = state;
    state.live = null;
    state.stopped = Promise.all([closeLive(live), state.opening?.catch(() => { return undefined; })]);
    return state.stopped;
}
/** AMQP record sink with confirms and independent connection recovery; never automatically replays sends. */
export default function amqpSink(url, options = {}) {
    const state = {url, options: settings(url, options), wanted: false, epoch: 0, request: 0,
        live: null, opening: null, retry: null, stopped: Promise.resolve(), reopen() { return begin(state); }};
    return {
        active() { return Boolean(state.live); },
        start() {
            state.wanted = true;
            state.request += 1;
            const { request } = state;
            return state.stopped.then(() => { if (request === state.request) { return begin(state); } return undefined; });
        },
        stop() { return stop(state); },
        write(records) {
            if (!Array.isArray(records)) { return Promise.reject(new TypeError('AMQP records must be an array')); }
            if (!state.live) { return Promise.reject(new Error('AMQP sink is not connected')); }
            const { live } = state;
            if (live.blocked || live.pending.size + records.length > state.options.maxPending) {
                return Promise.reject(new Error('AMQP sink backpressure: retry after confirmations or drain'));
            }
            return Promise.all(records.map((record) => { return publication(live, record, state.options.confirmTimeoutMs); }));
        }
    };
}
