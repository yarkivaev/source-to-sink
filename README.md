# source-to-sink

A library for building data streaming pipelines with batching and circuit breaker support.

## Installation

```bash
npm install @yarkivaev/source-to-sink
```

## Usage

```javascript
import { batch, circuit, timedBatch, clock, clickhouseSink, mqttSource } from '@yarkivaev/source-to-sink';

const clk = clock();
const breaker = circuit(5, 60, clk);
const sink = clickhouseSink('http://localhost:8123', 'metrics');
const collector = timedBatch(batch(sink, 1000, breaker), 5.0);
const source = mqttSource('mqtt://localhost:1883', 'sensors/#', collector);

source.start();
```

## Components

| Component | Description |
|-----------|-------------|
| `batch(sink, size, circuit)` | Collects records and flushes to sink when size is reached |
| `circuit(threshold, timeout, clock)` | Circuit breaker for failure isolation |
| `timedBatch(collector, interval)` | Adds time-based auto-flush to a collector |
| `clock()` | System time provider |
| `pollingSource(fetch, interval, collector, clock)` | Generic polling source with time window |
| `clickhouseSink(url, table)` | ClickHouse sink adapter |
| `mqttSource(url, topic, collector)` | MQTT subscription source |
| `lokiSource(url, query, interval, collector, clock)` | Loki polling source |

### STOMP delivery window

`stompSource(url, destination, collector, { prefetch: 32 })` bounds broker deliveries
that are waiting for acknowledgement. The default is 32; use a positive safe
integer to tune throughput. A zero (unlimited) window is rejected because a
backlog can otherwise exhaust the consumer's heap. With `manualAck: true`, the
collector remains responsible for settling frames. If it flushes only by count,
its batch must not exceed the prefetch window; a timed flush also avoids stalls.

Manual collectors may call `settle.nack(false)` to dead-letter invalid messages. Configure a durable dead-letter queue and broker policy before enabling this; without a route RabbitMQ discards rejected messages. `settle.nack()` retains retry behaviour.


## Transport sources and lifecycle

The sources below receive a collector with `accept(record)`. Return a promise
that resolves when processing is accepted; rejecting it reports a processing
failure. Keep application decoding, routing, SQL queries and cursor updates in
the collector. Await `stop()` before stopping downstream collectors or sinks,
so in-flight acceptance can finish. A collector that never settles also prevents
a draining stop from finishing.

### OPC UA

```javascript
import { opcuaSource } from '@yarkivaev/source-to-sink';

const source = opcuaSource([
  {
    url: 'opc.tcp://localhost:4840',
    publishMs: 250,
    heartbeatMs: 1000,
    channels: [{ nodeId: 'ns=1;s=Temperature', label: 'oven' }]
  }
], {
  async accept({ channel, value }) {
    await storeReading(channel.label, value);
  }
}, { onError: (error, connection) => console.error(connection.url, error) });

await source.start();
// Later: await source.stop();
```

Every endpoint connects, subscribes and retries independently. Fresh heartbeat
reads are serialized per endpoint and complement subscription updates; a value
can therefore be delivered more than once. Bad-status values are skipped.
Channel objects and values pass through unchanged. `stop()` disconnects endpoints
and waits for already-started acceptance; restarting does not duplicate sessions.

Options are `retryMs` (1000), `connectTimeoutMs` (5000),
`requestTimeoutMs` (5000), and `onError(error, connection)`. Intervals and timeouts
must be positive. Duplicate endpoint URLs or node IDs within an endpoint are
rejected. `start()` initiates independent connection loops; it does not wait for
all endpoints to become available.

The OPC UA network library loads only on `start()`, not on package import or
factory validation. Pure configuration validation is also available directly:

```javascript
import { validateConnections } from '@yarkivaev/source-to-sink/src/opcua/config.js';
validateConnections(connections);
```

### Serial chunks

```javascript
import { serialSource } from '@yarkivaev/source-to-sink';

const source = serialSource([
  { path: '/dev/ttyUSB0', baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 }
], {
  accept({ device, chunk }) {
    return decodeAndStore(device.path, chunk);
  }
}, { retryMs: 1000, onError: (error, device) => console.error(device.path, error) });

await source.start();
```

Each port has its own open/retry loop. `chunk` is the original buffer and `device`
is the original configuration object; framing and decoding belong in the
collector. Duplicate paths are rejected. Errors or a closed port trigger cleanup
and retry without interrupting other devices. `start()` initiates opens;
`stop()` waits for pending opens, closes ports, removes listeners and drains
in-flight acceptance before restart.

For testing or another port implementation, pass `openPort(device)`, returning a
port or promise for a port. The port supports EventEmitter `data`, `error` and
`close` events plus `close(callback)`. The default opens `serialport` lazily.
Serial input is a push stream; the source does not impose a collector backlog
limit or pause the device.

### Periodic collection

```javascript
import { intervalSource } from '@yarkivaev/source-to-sink';

const source = intervalSource(1000, {
  async accept({ ts }) {
    const records = await readChanges(ts);
    await publish(records);
    // Advance a cursor only after publication succeeds.
  }
}, { immediate: true, onError: console.error });

await source.start();
```

`intervalMs` must be positive. Ticks carry a Unix timestamp in milliseconds.
The default `immediate: false` waits one interval before the first tick. With
`immediate: true`, `start()` waits for the first acceptance to settle. Subsequent
ticks wait the interval after the previous acceptance settles, so slow work never
overlaps another tick. Rejections call `onError` and scheduling continues.
`stop()` cancels scheduling and drains the active tick; restart waits for that
drain. Tests can inject `schedule(callback, milliseconds)` and `clear(handle)`.

### AMQP consumption

```javascript
import { amqpSource } from '@yarkivaev/source-to-sink';

const source = amqpSource('amqp://localhost', 'readings', {
  async accept(delivery) {
    await storeReading(JSON.parse(delivery.content.toString()));
  }
}, {
  queueOptions: { durable: true },
  exchanges: [{ name: 'telemetry', type: 'topic', options: { durable: true } }],
  bindings: [{ exchange: 'telemetry', pattern: 'reading.#' }],
  prefetch: 32,
  onError: console.error
});

await source.start();
```

Deliveries contain `content`, `fields`, `properties`, `ack()` and
`reject(requeue = true)`. By default the source acknowledges only after
`collector.accept` resolves; rejection requeues the delivery and reports the
error. Settlement is idempotent within a delivery. Set `ackMode: 'manual'` to
let the collector choose `ack()` or `reject(false)` for dead-lettering; configure
a broker dead-letter route if those messages must be retained. A collector that
settles manually should still await its processing work so stop can drain it.

The default queue is durable and the default prefetch is 32. Choose a finite,
positive prefetch to bound outstanding broker deliveries. With count-based
batching, the batch must fit within that window, or use a timed flush.
Connection/channel failure or consumer cancellation causes reconnection with
backoff from one to 30 seconds. `stop()` cancels the consumer, drains acceptance,
and closes the channel and connection. `active()` means the lifecycle is running,
including while reconnecting; it does not prove a broker connection is ready.

`amqpSession(url, subscribeChannel, options)` exposes that same lifecycle for
custom channel topology or consumption. The async `subscribeChannel(channel)`
returns a consumer tag for cancellation. `options.drain(channel)` can await
application work before channel closure. Both APIs accept `onError` (or `report`),
`connect(url)`, `schedule(callback, milliseconds)` and `clear(handle)`; the latter
three are useful for testing. The default connection uses a ten-second heartbeat.

### AMQP publication

```javascript
import { amqpSink } from '@yarkivaev/source-to-sink';

const sink = amqpSink('amqp://localhost', {
  exchanges: [{ name: 'telemetry', type: 'topic', options: { durable: true } }],
  maxPending: 1024,
  onError: console.error
});
await sink.start();
await sink.write([{
  exchange: 'telemetry', routingKey: 'reading.temperature',
  body: JSON.stringify({ value: 42 }), options: { persistent: true }
}]);
await sink.stop();
```

`write(records)` resolves after broker publisher confirms for every record. Each
record requires an exchange, routing key and string or Buffer body; `options`
passes publication options to amqplib. A confirm does not mean a consumer has
processed the message or that an unroutable message reached a queue.

`maxPending` (default 1024) bounds outstanding confirmations. Writes reject while
the connection is unavailable, when the channel awaits its `drain` event, or when
the batch would exceed that bound. There is no unbounded offline queue. A write
can partially succeed before rejection; callers must account for that when
choosing retries or advancing cursors.

Connection loss or `confirmTimeoutMs` expiry rejects uncertain publications and
reconnects for future writes. **The sink never automatically replays records**:
the broker may already have accepted them. Use application idempotency when
retrying uncertain results. `active()` reports whether a live channel exists.
`start()` waits for connection and topology setup; a failed initial attempt
rejects while background retries continue until stopped.

Other options are `retryMs` (1000), `connectTimeoutMs` (5000),
`confirmTimeoutMs` (10000), `onError(error)`, and injectable
`connect(url, connectionOptions)`. Exchange declarations default to type `topic`
and durable options when omitted. `stop()` closes the session and rejects pending
confirms; it does not flush them. For graceful shutdown, first stop and drain
sources, await outstanding `write()` promises, then stop the sink.

## License

MIT
