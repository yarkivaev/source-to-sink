import deadline from './deadline.js';

/** Attempt every cleanup stage; an uncertain stage prevents reuse even if later cleanup succeeds. */
export default async function brokerClose(actions, timeoutMs, label, destroy) {
    const failures = [];
    for (const action of actions) {
        try {
            // Cleanup order matters, but one hung stage must not skip transport closure.
            // eslint-disable-next-line no-await-in-loop
            await deadline(Promise.resolve().then(action), timeoutMs, label, destroy);
        } catch (error) {
            if (error.name !== 'IllegalOperationError') { failures.push(error); }
        }
    }
    if (failures.length) { throw failures[0]; }
}
export function destroyConnection(connection) {
    connection?.connection?.stream?.destroy();
}
