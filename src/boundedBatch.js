import positive from './positive.js';
import boundedWrite from './boundedWrite.js';

function settings(options) {
    const config = { size: 100, maxRecords: 1000, maxBytes: 1048576, maxWaitMs: 1000, writeTimeoutMs: 10000, ...options };
    ['size', 'maxRecords', 'maxBytes', 'maxWaitMs', 'writeTimeoutMs'].forEach((key) => { positive(config[key], key); });
    if (!Number.isInteger(config.size) || !Number.isInteger(config.maxRecords) || config.size > config.maxRecords) {
        throw new TypeError('Invalid batch size or capacity');
    }
    return config;
}
function entry(record) {
    const bytes = Buffer.byteLength(JSON.stringify(record));
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { record, bytes, promise, resolve, reject };
}
function release(entries) {
    entries.forEach((item) => { item.release?.(); });
}
function settle(state, entries, error) {
    entries.forEach((item) => {
        state.bytes -= item.bytes;
        state.count -= 1;
        if (error) { item.reject(error); } else { item.resolve(); }
    });
}
function discard(state, error) {
    const queued = state.queue.splice(0);
    release(queued);
    settle(state, queued, error);
}
function ready(state, config) {
    return state.queue.length && (state.stopping || state.force || state.queue.length >= config.size);
}
async function drain(state, sink, config) {
    let failure;
    while (ready(state, config)) {
        const entries = state.queue.splice(0, config.size);
        try {
            // One write owns the sink until it completes or is retired as uncertain.
            // eslint-disable-next-line no-await-in-loop
            await boundedWrite(sink, entries.map((item) => { return item.record; }), config.writeTimeoutMs, () => { release(entries); });
            settle(state, entries);
        } catch (error) {
            failure = error;
            settle(state, entries, error);
            if (error.code === 'WRITE_TIMEOUT') {
                state.failed = true;
                discard(state, error);
            }
        }
    }
    state.force = false;
    if (failure) { throw failure; }
}
function dispatch(state, sink, config) {
    if (state.running) { return state.running; }
    state.running = drain(state, sink, config).finally(() => {
        state.running = null;
    });
    return state.running;
}
function schedule(state, sink, config) {
    if (!state.timer) {
        state.timer = setTimeout(() => {
            state.timer = null;
            state.force = true;
            void dispatch(state, sink, config).catch(() => { return undefined; });
        }, config.maxWaitMs);
    }
    if (state.queue.length >= config.size) { void dispatch(state, sink, config).catch(() => { return undefined; }); }
}
function accept(state, sink, config, record) {
    if (state.stopping || state.failed) { return Promise.reject(new Error('Batch stopped or failed')); }
    const item = entry(record);
    if (state.count >= config.maxRecords || state.bytes + item.bytes > config.maxBytes) {
        item.reject(new Error('Batch capacity exceeded'));
        return item.promise;
    }
    item.release = config.budget?.reserve({ bytes: item.bytes, records: 1 });
    state.count += 1;
    state.bytes += item.bytes;
    state.queue.push(item);
    schedule(state, sink, config);
    return item.promise;
}
/** Bounded async acceptance; callers own retries, including uncertain outcomes. */
export default function boundedBatch(sink, options = {}) {
    if (!sink || typeof sink.write !== 'function') { throw new TypeError('Sink must have write()'); }
    const config = settings(options);
    const state = { queue: [], count: 0, bytes: 0, timer: null, running: null, force: false, stopping: false, failed: false };
    return {
        accept(record) {
            try { return accept(state, sink, config, record); } catch (error) { return Promise.reject(error); }
        },
        flush() {
            clearTimeout(state.timer);
            state.timer = null;
            state.force = true;
            return dispatch(state, sink, config);
        },
        stop() {
            state.stopping = true;
            clearTimeout(state.timer);
            state.timer = null;
            return dispatch(state, sink, config);
        },
        status() { return { records: state.count, bytes: state.bytes, failed: state.failed }; }
    };
}
