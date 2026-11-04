import positive from './positive.js';

function report(options, error, device) {
    try { options.onError?.(error, device); } catch {
        // Observability must not prevent retries.
    }
}
async function openPort(device) {
    const { SerialPort } = await import('serialport');
    const port = new SerialPort({ ...device, autoOpen: false });
    await new Promise((resolve, reject) => { port.open((error) => { if (error) { reject(error); } else { resolve(); } }); });
    return port;
}
function closePort(port) {
    if (port.isOpen === false) { return Promise.resolve(); }
    return new Promise((resolve) => { port.close(() => { resolve(); }); });
}
function pause(state, milliseconds) {
    return new Promise((resolve) => { state.wake = resolve; state.timer = setTimeout(resolve, milliseconds); })
        .finally(() => { clearTimeout(state.timer); state.wake = null; });
}
async function receive(state, port, device, collector, options) {
    const pending = new Set();
    const closed = new Promise((resolve) => { state.wake = resolve; });
    function data(chunk) {
        const accepted = Promise.resolve().then(() => {
            if (state.active) { return collector.accept({ device, chunk }); }
            return undefined;
        }).catch((error) => { report(options, error, device); }).finally(() => { pending.delete(accepted); });
        pending.add(accepted);
    }
    function failed(failure) { report(options, failure, device); state.wake?.(); }
    function close() { state.wake?.(); }
    port.on('data', data).on('error', failed).on('close', close);
    if (!state.active) { state.wake(); }
    await closed;
    port.off('data', data);
    try { await closePort(port); } finally {
        port.off('error', failed).off('close', close);
        await Promise.all(pending);
    }
}
async function run(state, device, collector, options) {
    while (state.active) {
        try {
            // Each port has an independent serialized open/close/retry loop.
            // eslint-disable-next-line no-await-in-loop
            const port = await options.openPort(device);
            // eslint-disable-next-line no-await-in-loop
            await receive(state, port, device, collector, options);
        } catch (error) { if (state.active) { report(options, error, device); } }
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
    const settings = { retryMs: 1000, ...options, openPort: options.openPort ?? openPort };
    positive(settings.retryMs, 'retryMs');
    const states = devices.map(() => { return { active: false, task: null, wake: null, timer: null }; });
    let revision = 0;
    let stopping = Promise.resolve();
    return {
        async start() {
            revision += 1;
            const requested = revision;
            await stopping;
            if (requested === revision) {
                states.forEach((state, index) => {
                    if (!state.active) { state.active = true; state.task = run(state, devices[index], collector, settings); }
                });
            }
        },
        stop() {
            revision += 1;
            states.forEach((state) => { state.active = false; state.wake?.(); });
            stopping = Promise.all(states.map((state) => { return state.task; }));
            return stopping;
        }
    };
}
