import deadline from './deadline.js';

export function report(options, error, device) {
    try { options.onError?.(error, device); } catch {
        // Diagnostics cannot prevent shutdown.
    }
}
export function closePort(port, timeoutMs) {
    if (port.isOpen === false) { return Promise.resolve(); }
    return deadline(new Promise((resolve, reject) => {
        port.close((error) => { if (error) { reject(error); } else { resolve(); } });
    }), timeoutMs, 'Serial close', () => { port.destroy?.(); }).catch((error) => {
        error.resourceUncertain = true;
        throw error;
    });
}
function reserve(ctx, size) {
    try {
        const release = ctx.options.budget?.reserve({ bytes: size, records: 1 });
        ctx.port.pause?.();
        return { release };
    }
    catch (error) {
        Object.assign(ctx.state, { fatal: error, active: false });
        ctx.state.controller.abort(error);
        ctx.fail(error);
        return null;
    }
}
function accept(ctx, chunk, release) {
    const accepted = Promise.resolve().then(() => {
        if (ctx.state.active && !ctx.failed) { return ctx.collector.accept({ device: ctx.device, chunk }, { signal: ctx.state.controller.signal }); }
        return undefined;
    });
    void accepted.finally(() => { release?.(); }).catch(() => { return undefined; });
    return deadline(accepted, ctx.options.acceptTimeoutMs, 'Serial acceptance', (error) => {
        ctx.state.fatal = error; ctx.state.active = false; ctx.state.controller.abort(error);
    });
}
function enqueue(ctx, chunk) {
    if (!ctx.state.active) { return; }
    const size = chunk.length ?? Buffer.byteLength(String(chunk));
    if (ctx.count >= ctx.options.maxPending || ctx.bytes + size > ctx.options.maxPendingBytes) {
        const error = new Error('Serial receive capacity exceeded; source retired');
        Object.assign(ctx.state, { fatal: error, active: false });
        ctx.state.controller.abort(error);
        ctx.fail(error);
        return;
    }
    const lease = reserve(ctx, size);
    if (!lease) { return; }
    Object.assign(ctx, { count: ctx.count + 1, bytes: ctx.bytes + size });
    ctx.pending = ctx.pending.then(() => {
        if (ctx.state.active && !ctx.failed) {
            return accept(ctx, chunk, lease.release);
        }
        lease.release?.();
        return undefined;
    }).catch(ctx.fail).finally(() => {
        ctx.count -= 1;
        ctx.bytes -= size;
        if (!ctx.count && ctx.state.active && !ctx.failed) { ctx.port.resume?.(); }
    });
}
/** Bound data even if a custom driver ignores pause; pause/resume the native stream. */
export default async function receive(state, port, device, collector, options) {
    const ctx = { state, port, device, collector, options, pending: Promise.resolve(), count: 0, bytes: 0, failed: false };
    const closed = new Promise((resolve) => { state.wake = resolve; });
    ctx.fail = (error) => { ctx.failed = true; report(options, error, device); state.wake?.(); };
    function data(chunk) { enqueue(ctx, chunk); }
    function close() { state.wake?.(); }
    port.on('data', data).on('error', ctx.fail).on('close', close);
    if (!state.active) { state.wake(); }
    await closed;
    port.off('data', data);
    try {
        await closePort(port, options.stopTimeoutMs);
        await deadline(ctx.pending, options.stopTimeoutMs, 'Serial acceptance', (error) => { state.controller.abort(error); });
    } finally { port.off('error', ctx.fail).off('close', close); }
}
