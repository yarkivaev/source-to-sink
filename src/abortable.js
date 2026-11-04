/** Cancels the driver and revokes its result; callers still own resource cleanup. */
export default function abortable(promise, signal, cancel) {
    if (!signal) { return promise; }
    const state = {};
    function abort() {
        const error = signal.reason || new Error('Operation aborted');
        try { cancel(); } catch (failure) { state.reject(failure); return; }
        state.reject(error);
    }
    const stopped = new Promise((resolve, reject) => { state.reject = reject; });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); }
    return Promise.race([promise, stopped]).finally(() => { signal.removeEventListener('abort', abort); });
}
