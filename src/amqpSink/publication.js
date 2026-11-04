import { randomUUID } from 'node:crypto';

function publishOptions(record) {
    const options = record.options || {};
    if (!options.mandatory) { return options; }
    const headers = { ...options.headers, 'x-source-to-sink-publish-id': randomUUID() };
    return { ...options, headers };
}
/** Confirms one send, without replaying an outcome the broker may already have accepted. */
export default function publication(live, record, timeoutMs, signal) {
    if (!record || typeof record.exchange !== 'string' || typeof record.routingKey !== 'string'
        || !(typeof record.body === 'string' || Buffer.isBuffer(record.body))) {
        return Promise.reject(new TypeError('AMQP record requires exchange, routingKey and string/Buffer body'));
    }
    if (signal?.aborted) { return Promise.reject(signal.reason || new Error('AMQP publish aborted')); }
    const options = publishOptions(record);
    return new Promise((resolve, reject) => {
        const body = Buffer.isBuffer(record.body) ? record.body : Buffer.from(record.body);
        let settled = false;
        function abort() { live.fail(signal.reason || new Error('AMQP publish aborted')); }
        const timer = { handle: null };
        function settle(error) {
            if (!settled) {
                settled = true;
                clearTimeout(timer.handle);
                signal?.removeEventListener('abort', abort);
                live.pending.delete(settle);
                if (options.mandatory) { live.returns.delete(options.headers['x-source-to-sink-publish-id']); }
                if (error) { reject(error); } else { resolve(); }
            }
        }
        timer.handle = setTimeout(() => {
            const error = new Error('AMQP publish confirmation timed out');
            settle(error);
            live.fail(error);
        }, timeoutMs);
        live.pending.add(settle);
        if (options.mandatory) { live.returns.set(options.headers['x-source-to-sink-publish-id'], settle); }
        signal?.addEventListener('abort', abort, { once: true });
        try {
            if (!live.channel.publish(record.exchange, record.routingKey, body, options, settle)) {
                live.blocked = true;
            }
        } catch (error) { settle(error); }
    });
}
