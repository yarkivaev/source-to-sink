/** Confirms one send, without replaying an outcome the broker may already have accepted. */
export default function publication(live, record, timeoutMs) {
    if (!record || typeof record.exchange !== 'string' || typeof record.routingKey !== 'string'
        || !(typeof record.body === 'string' || Buffer.isBuffer(record.body))) {
        return Promise.reject(new TypeError('AMQP record requires exchange, routingKey and string/Buffer body'));
    }
    return new Promise((resolve, reject) => {
        const body = Buffer.isBuffer(record.body) ? record.body : Buffer.from(record.body);
        let settled = false;
        const timer = { handle: null };
        function settle(error) {
            if (!settled) {
                settled = true;
                clearTimeout(timer.handle);
                live.pending.delete(settle);
                if (error) { reject(error); } else { resolve(); }
            }
        }
        timer.handle = setTimeout(() => {
            const error = new Error('AMQP publish confirmation timed out');
            settle(error);
            live.fail(error);
        }, timeoutMs);
        live.pending.add(settle);
        try {
            if (!live.channel.publish(record.exchange, record.routingKey, body, record.options || {}, settle)) {
                live.blocked = true;
            }
        } catch (error) { settle(error); }
    });
}
