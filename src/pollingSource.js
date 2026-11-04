import intervalSource from './intervalSource.js';

function validate(fetch, collector, clk) {
    if (typeof fetch !== 'function') { throw new Error('Fetch must be a function'); }
    if (!collector || typeof collector.accept !== 'function') { throw new Error('Collector must have an accept() method'); }
    if (!clk || typeof clk.millis !== 'function') { throw new Error('Clock must have a millis() method'); }
}
async function deliver(rows, collector, current) {
    if (!Array.isArray(rows) || rows.length > 10000) { throw new Error('Polling response capacity exceeded'); }
    for (const record of rows) {
        if (!current()) { return; }
        // Serial acceptance bounds downstream work and preserves cursor ordering.
        // eslint-disable-next-line no-await-in-loop
        await collector.accept(record);
    }
}
/** Sequential polling; advance cursor only after acceptance, discard revoked reads. */
export default function pollingSource(fetch, interval, collector, clk) {
    validate(fetch, collector, clk);
    if (!Number.isFinite(interval) || interval <= 0) { throw new Error('Interval must be a positive number'); }
    const state = { revision: 0, active: false, since: clk.millis() };
    const source = intervalSource(interval * 1000, {
        async accept(event, { signal } = {}) {
            const { revision } = state;
            const until = clk.millis();
            const rows = await fetch(state.since, until, { signal });
            function current() { return state.active && state.revision === revision; }
            await deliver(rows, collector, current);
            if (current()) { Object.assign(state, { since: until }); }
        }
    });
    return {
        start() {
            if (state.active) { return Promise.resolve(); }
            state.active = true;
            state.revision += 1;
            state.since = clk.millis();
            return source.start();
        },
        stop() {
            state.active = false;
            state.revision += 1;
            return source.stop();
        }
    };
}
