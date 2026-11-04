import ModbusRTU from 'modbus-serial';
import positive from './positive.js';
import deadline from './deadline.js';

function validate(path, serial, slaves, poll) {
    if (typeof path !== 'string' || !path) { throw new Error('Serial path must be a non-empty string'); }
    if (!serial || !Number.isFinite(serial.baudRate) || serial.baudRate <= 0) { throw new Error('Serial baudRate must be a positive number'); }
    if (!Array.isArray(slaves) || !slaves.length) { throw new Error('Slaves must be a non-empty array'); }
    positive(poll.interval, 'interval');
    slaves.forEach((slave) => {
        if (!Number.isInteger(slave.slaveId) || slave.slaveId < 1 || slave.slaveId > 247 || typeof slave.collector?.accept !== 'function') {
            throw new TypeError('Each RTU slave requires an ID from 1 to 247 and a collector');
        }
    });
}
function report(ctx, error) {
    try { ctx.poll.log?.error(`RTU bus on ${ctx.path}: ${error.message}`); } catch {
        // Diagnostics cannot stop recovery.
    }
}
function close(ctx) {
    ctx.closing ??= deadline(new Promise((resolve, reject) => {
        ctx.client.close((error) => { if (error) { reject(error); } else { resolve(); } });
    }), ctx.poll.stopTimeoutMs, 'RTU close');
    return ctx.closing;
}
function pause(ctx) {
    return new Promise((resolve) => { ctx.wake = resolve; ctx.timer = setTimeout(resolve, ctx.poll.interval * 1000); })
        .finally(() => { clearTimeout(ctx.timer); ctx.wake = null; });
}
async function read(ctx, slave) {
    ctx.client.setID(slave.slaveId);
    const result = await deadline(ctx.client.readHoldingRegisters(ctx.poll.address, ctx.poll.count), ctx.poll.readTimeoutMs, 'RTU read');
    if (ctx.active) {
        await deadline(Promise.resolve().then(() => {
            return slave.collector.accept(result.data, { signal: ctx.controller.signal });
        }), ctx.poll.acceptTimeoutMs, 'RTU acceptance', (error) => { ctx.controller.abort(error); });
    }
}
async function cycle(ctx) {
    for (const slave of ctx.slaves) {
        if (!ctx.active) { return; }
        try {
            // Shared setID requires every read and acceptance to finish before the next slave.
            // eslint-disable-next-line no-await-in-loop
            await read(ctx, slave);
        } catch (error) {
            if (error.code === 'OPERATION_TIMEOUT') { throw error; }
            report(ctx, error);
        }
    }
}
async function session(ctx) {
    ctx.opening = true;
    const opening = ctx.client.connectRTUBuffered(ctx.path, ctx.serial);
    void Promise.resolve(opening).then(() => {
        ctx.opening = false;
        if (!ctx.active) { return close(ctx); }
        return undefined;
    }, () => { ctx.opening = false; }).catch((error) => { report(ctx, error); });
    await deadline(opening, ctx.poll.connectTimeoutMs, 'RTU connect');
    while (ctx.active) {
        // eslint-disable-next-line no-await-in-loop
        await cycle(ctx);
        // eslint-disable-next-line no-await-in-loop
        if (ctx.active) { await pause(ctx); }
    }
}
async function run(ctx) {
    while (ctx.active) {
        ctx.client = (ctx.poll.createClient || (() => { return new ModbusRTU(); }))();
        ctx.client.setTimeout(ctx.poll.readTimeoutMs);
        ctx.closing = null;
        try {
            // eslint-disable-next-line no-await-in-loop
            await session(ctx);
        } catch (error) {
            report(ctx, error);
            if (error.code === 'OPERATION_TIMEOUT') { Object.assign(ctx, { fatal: error, active: false }); }
        } finally {
            // Never treat closing a still-opening handle as proof its eventual port is closed.
            // eslint-disable-next-line no-await-in-loop
            if (!ctx.opening) { await close(ctx); }
        }
        // eslint-disable-next-line no-await-in-loop
        if (ctx.active) { await pause(ctx); }
    }
}
function launch(path, serial, slaves, poll) {
    const ctx = { path, serial, slaves, poll, active: true, controller: new AbortController() };
    ctx.task = run(ctx);
    void ctx.task.catch((error) => { ctx.fatal = error; ctx.active = false; report(ctx, error); });
    return ctx;
}
/** One serialized RTU bus. stop drains/closes; uncertain deadlines quarantine this instance. */
export default function modbusRtuBusSource(path, serial, slaves, poll) {
    validate(path, serial, slaves, poll);
    const settings = { readTimeoutMs: 5000, connectTimeoutMs: 5000, acceptTimeoutMs: 10000, stopTimeoutMs: 5000, ...poll };
    ['readTimeoutMs', 'connectTimeoutMs', 'acceptTimeoutMs', 'stopTimeoutMs'].forEach((key) => { positive(settings[key], key); });
    let ctx;
    let revision = 0;
    return {
        async start() {
            if (ctx?.active) { return; }
            revision += 1;
            const requested = revision;
            if (ctx) {
                await ctx.task;
                if (ctx.fatal) { throw ctx.fatal; }
            }
            if (requested === revision) { ctx = launch(path, serial, slaves, settings); }
        },
        stop() {
            revision += 1;
            if (!ctx) { return Promise.resolve(); }
            ctx.active = false;
            ctx.controller.abort(new Error('RTU source stopped'));
            ctx.wake?.();
            return deadline(ctx.task, settings.stopTimeoutMs, 'RTU stop', (error) => { ctx.fatal = error; if (!ctx.opening) { void close(ctx).catch(() => { return undefined; }); } }).then(() => {
                if (ctx.fatal) { throw ctx.fatal; }
            });
        }
    };
}
