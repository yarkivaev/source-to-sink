import { OPCUAClient } from 'node-opcua';
import session from './session.js';

function report(options, error, connection) {
    try {
        options.onError?.(error, connection);
    } catch {
        // Observability callbacks must not break endpoint recovery.
    }
}
function delay(state, milliseconds) {
    return new Promise((resolve) => {
        state.wake = resolve;
        state.timer = setTimeout(resolve, milliseconds);
    }).finally(() => { clearTimeout(state.timer); });
}
function clientFor(options) {
    return OPCUAClient.create({ endpointMustExist: false, keepSessionAlive: false,
        connectionStrategy: { maxRetry: 0 }, transportTimeout: options.connectTimeoutMs,
        defaultTransactionTimeout: options.requestTimeoutMs, requestedSessionTimeout: options.requestTimeoutMs * 2 });
}
function disconnection(client) {
    let pending;
    return () => {
        pending ??= client.disconnect();
        return pending;
    };
}
async function attempt(state, connection, publish, options) {
    const client = clientFor(options);
    const close = disconnection(client);
    state.close = close;
    const current = { active: true, connection, wake: null, timer: null, pending: new Set() };
    state.current = current;
    try {
        await client.connect(connection.url);
        if (state.active) {
            await session(current, client, connection, publish, options);
        }
    } catch (error) {
        if (state.active) {
            report(options, error, connection);
        }
    } finally {
        current.active = false;
        try { await close(); } finally { await Promise.all(current.pending); }
    }
}
async function run(state, connection, publish, options) {
    while (state.active) {
        // Each endpoint deliberately serializes attempts and heartbeat reads.
        // eslint-disable-next-line no-await-in-loop
        await attempt(state, connection, publish, options);
        if (state.active) {
            // eslint-disable-next-line no-await-in-loop
            await delay(state, options.retryMs);
        }
    }
}
export default function endpoint(connection, publish, options) {
    const state = { active: false, close: null, current: null, task: null, wake: null, timer: null };
    return {
        start() {
            if (!state.active) {
                state.active = true;
                state.task = run(state, connection, publish, options);
            }
        },
        async stop() {
            state.active = false;
            if (state.current) {
                state.current.active = false;
                state.current.wake?.();
            }
            state.wake?.();
            await state.close?.();
            await state.task;
        }
    };
}
