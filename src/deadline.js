/** Bounds waiting only. Callers must cancel the driver and quarantine uncertain resources. */
export default function deadline(promise, milliseconds, label, cancel = () => { return undefined; }) {
    let timer;
    return Promise.race([promise, new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`${label} timed out; outcome uncertain`);
            error.code = 'OPERATION_TIMEOUT';
            try { cancel(error); } catch (failure) { error.cause = failure; }
            reject(error);
        }, milliseconds);
    })]).finally(() => { clearTimeout(timer); });
}
