import amqpSession from './amqpSource/session.js';

function deliveryFor(channel, message) {
    let settled = false;
    return {
        content: message.content, fields: message.fields, properties: message.properties,
        ack() {
            if (!settled) { channel.ack(message); settled = true; }
        },
        reject(requeue = true) {
            if (!settled) { channel.nack(message, false, requeue); settled = true; }
        }
    };
}
function reportFailure(options, error) {
    const report = options.onError || options.report;
    try {
        if (report) { report(error); }
        else { process.stderr.write(`amqp delivery failed ${error.message}\n`); }
    } catch {
        // Error reporting must not reject a broker callback.
    }
}
function rejectDelivery(delivery, options, error) {
    try { delivery.reject(true); }
    catch (settlementError) { reportFailure(options, settlementError); }
    reportFailure(options, error);
}
function consume(channel, collector, options) {
    return async (message) => {
        if (!message) { channel.emit('close'); return; }
        const delivery = deliveryFor(channel, message);
        try {
            await collector.accept(delivery);
            if (options.ackMode !== 'manual') { delivery.ack(); }
        } catch (error) {
            rejectDelivery(delivery, options, error);
        }
    };
}
function trackedConsume(channel, collector, options, pending) {
    const accept = consume(channel, collector, options);
    return (message) => {
        const delivery = accept(message);
        pending.add(delivery);
        return delivery.finally(() => { pending.delete(delivery); });
    };
}
async function topology(channel, queue, options) {
    await Promise.all((options.exchanges || []).map((exchange) => {
        return channel.assertExchange(exchange.name, exchange.type, exchange.options);
    }));
    const declared = await channel.assertQueue(queue, options.queueOptions || { durable: true });
    const name = declared?.queue || queue;
    await Promise.all((options.bindings || []).map((binding) => {
        return channel.bindQueue(name, binding.exchange, binding.pattern, binding.args);
    }));
    await channel.prefetch(options.prefetch || 32);
    return name;
}
/** Delivers AMQP records, acknowledging only after collector acceptance. */
export default function amqpSource(url, queue, collector, options = {}) {
    if (!collector || typeof collector.accept !== 'function') { throw new Error('Collector must have an accept() method'); }
    const pending = new Set();
    return amqpSession(url, async (channel) => {
        const name = await topology(channel, queue, options);
        const result = await channel.consume(name, trackedConsume(channel, collector, options, pending), { noAck: false });
        return result.consumerTag;
    }, { ...options, drain() { return Promise.all([...pending]); } });
}
