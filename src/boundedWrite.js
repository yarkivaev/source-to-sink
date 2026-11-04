/** A deadline also aborts the driver; uncertain writes retire this collector. */
export default function boundedWrite(sink, records, timeoutMs, onSettled) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            const error = new Error('Batch write timed out; outcome uncertain');
            error.code = 'WRITE_TIMEOUT';
            controller.abort(error);
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([
        Promise.resolve().then(() => { return sink.write(records, { signal: controller.signal }); }).finally(() => { onSettled?.(); }), timeout
    ]).finally(() => { clearTimeout(timer); });
}
