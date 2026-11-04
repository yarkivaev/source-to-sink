import positive from './positive.js';
import deadline from './deadline.js';

function report(onError, error) {
    try { onError?.(error); } catch {
        // Observability must not stop scheduling.
    }
}

/** Serialized periodic ticks. stop() drains acceptance before restart can run. */
export default function intervalSource(intervalMs, collector, options = {}) {
    positive(intervalMs, 'intervalMs');
    if (!collector || typeof collector.accept !== 'function') {
        throw new TypeError('Collector must have an accept() method');
    }
    const { stopTimeoutMs = 5000, acceptTimeoutMs = 10000 } = options;
    positive(stopTimeoutMs, 'stopTimeoutMs');
    positive(acceptTimeoutMs, 'acceptTimeoutMs');
    const { immediate = false, onError, schedule = setTimeout, clear = clearTimeout } = options;
    const state = { active: false, revision: 0, timer: null, pending: Promise.resolve() };
    function tick(revision) {
        if (!state.active || revision !== state.revision) { return; }
        state.timer = null;
        state.pending = Promise.resolve().then(() => {
            if (state.active && revision === state.revision) { return deadline(Promise.resolve(collector.accept({ ts: Date.now() }, { signal: state.controller.signal })), acceptTimeoutMs, 'Interval acceptance', (error) => { state.fatal = error; state.active = false; state.controller.abort(error); }); }
            return undefined;
        }).catch((error) => { report(onError, error); }).then(() => {
            if (state.active && revision === state.revision) {
                state.timer = schedule(() => { tick(revision); }, intervalMs);
            }
        });
    }
    return {
        async start() {
            if (state.active) { return; }
            const revision = state.revision + 1;
            state.revision = revision;
            await state.pending;
            if (state.fatal) { throw state.fatal; }
            if (revision !== state.revision) { return; }
            Object.assign(state, { active: true, controller: new AbortController() });
            if (immediate) { tick(revision); await state.pending; } else { state.timer = schedule(() => { tick(revision); }, intervalMs); }
        },
        stop() {
            state.active = false;
            state.revision += 1;
            clear(state.timer);
            state.timer = null;
            state.controller?.abort(new Error('Interval source stopped'));
            return deadline(state.pending, stopTimeoutMs, 'Interval stop', (error) => { state.fatal = error; }).then(() => {
                if (state.fatal) { throw state.fatal; }
            });
        }
    };
}
