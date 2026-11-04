import positive from './positive.js';

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
    const { immediate = false, onError, schedule = setTimeout, clear = clearTimeout } = options;
    const state = { active: false, revision: 0, timer: null, pending: Promise.resolve() };
    function tick(revision) {
        if (!state.active || revision !== state.revision) { return; }
        state.timer = null;
        state.pending = Promise.resolve().then(() => {
            if (state.active && revision === state.revision) { return collector.accept({ ts: Date.now() }); }
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
            state.revision += 1;
            const { revision } = state;
            await state.pending;
            if (revision !== state.revision) { return; }
            state.active = true;
            if (immediate) { tick(revision); await state.pending; } else { state.timer = schedule(() => { tick(revision); }, intervalMs); }
        },
        stop() {
            state.active = false;
            state.revision += 1;
            clear(state.timer);
            state.timer = null;
            return state.pending;
        }
    };
}
