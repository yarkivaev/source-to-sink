import positive from './positive.js';

import deadline from './deadline.js';
import receive, { closePort, report } from './serialReceive.js';

async function openPort(device) {
    const { SerialPort } = await import('serialport');
    const port = new SerialPort({ ...device, autoOpen: false });
    await new Promise((resolve, reject) => { port.open((error) => { if (error) { reject(error); } else { resolve(); } }); });
    return port;
}
function pause(state, milliseconds) {
    return new Promise((resolve) => { state.wake = resolve; state.timer = setTimeout(resolve, milliseconds); })
        .finally(() => { clearTimeout(state.timer); state.wake = null; });
}
async function run(state, device, collector, options) {
    while (state.active) {
        try {
            // Each port has an independent serialized open/close/retry loop.
            const attempt = { timedOut: false };
            const opening = Promise.resolve().then(() => { return options.openPort(device, { signal: state.controller.signal }); });
            void opening.then((late) => {
                if (attempt.timedOut) { return closePort(late, options.stopTimeoutMs); }
                return undefined;
            }).catch((error) => { report(options, error, device); });
            // A timed-out open is uncertain; never open a second handle in this instance.
            // eslint-disable-next-line no-await-in-loop
            const port = await deadline(opening, options.openTimeoutMs, 'Serial open', (error) => { attempt.timedOut = true; state.controller.abort(error); });
            // eslint-disable-next-line no-await-in-loop
            await receive(state, port, device, collector, options);
        } catch (error) {
            if (error.resourceUncertain || error.code === 'OPERATION_TIMEOUT') { Object.assign(state, { fatal: error, active: false }); }
            report(options, error, device);
        }
        if (state.active) {
            // eslint-disable-next-line no-await-in-loop
            await pause(state, options.retryMs);
        }
    }
}
function validate(devices, collector) {
    if (!Array.isArray(devices)) { throw new TypeError('devices must be an array'); }
    if (!collector || typeof collector.accept !== 'function') { throw new TypeError('Collector must have an accept() method'); }
    const paths = new Set();
    devices.forEach((device) => {
        if (!device || typeof device.path !== 'string' || !device.path.trim() || paths.has(device.path)) {
            throw new TypeError('invalid or duplicate serial path');
        }
        paths.add(device.path);
    });
}
/** Independent serial devices; chunks and device metadata pass through unchanged. */
export default function serialSource(devices, collector, options = {}) {
    validate(devices, collector);
    const settings = { retryMs: 1000, openTimeoutMs: 5000, acceptTimeoutMs: 10000, stopTimeoutMs: 5000, maxPending: 32, maxPendingBytes: 1048576,
        ...options, openPort: options.openPort ?? openPort };
    ['retryMs', 'acceptTimeoutMs', 'openTimeoutMs', 'stopTimeoutMs', 'maxPending', 'maxPendingBytes'].forEach((key) => { positive(settings[key], key); });
    if (!Number.isSafeInteger(settings.maxPending) || !Number.isSafeInteger(settings.maxPendingBytes)) { throw new TypeError('Serial capacities must be safe integers'); }
    const states = devices.map(() => { return { active: false, task: null, wake: null, timer: null }; });
    let revision = 0;
    let stopping = Promise.resolve();
    return {
        async start() {
            revision += 1;
            const requested = revision;
            await stopping;
            const failed = states.find((state) => { return state.fatal; });
            if (failed) { throw failed.fatal; }
            if (requested === revision) {
                states.forEach((state, index) => {
                    if (!state.active) { state.active = true; state.controller = new AbortController(); state.task = run(state, devices[index], collector, settings); }
                });
            }
        },
        stop() {
            revision += 1;
            states.forEach((state) => { state.active = false; state.controller?.abort(new Error('Serial source stopped')); state.wake?.(); });
            stopping = deadline(Promise.all(states.map((state) => { return state.task; })), settings.stopTimeoutMs, 'Serial stop', (error) => {
                states.forEach((state) => { state.fatal = error; });
            }).then(() => {
                const failed = states.find((state) => { return state.fatal; });
                if (failed) { throw failed.fatal; }
            });
            return stopping;
        }
    };
}
