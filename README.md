# source-to-sink

Lightweight, protocol-independent primitives for composing asynchronous data flows.
No runtime dependencies, device drivers, database clients or SCADA runtime.

```js
import { boundedBatch, intervalSource } from '@yarkivaev/source-to-sink';
const sink = { async write(records, { signal }) {
    signal.throwIfAborted();
    // Persist or forward records using an application-owned adapter.
} };
const batch = boundedBatch(sink, { size: 1, maxRecords: 100, maxBytes: 65536 });
const source = intervalSource(1000, { accept() { return batch.accept({ value: 42 }); } });
await source.start();
// When finished: await source.stop(); await batch.stop();
```

Exports: `batch`, `boundedBatch`, `timedBatch`, `circuit`, `clock`,
`intervalSource`, `pollingSource`, `deadline`.

`boundedBatch(sink, options)` bounds pending records, bytes and flush waiting.
Defaults: `size: 100`, `maxRecords: 1000`, `maxBytes: 1048576`,
`maxWaitMs: 1000`, `writeTimeoutMs: 10000`. `accept()` resolves after the sink
write; capacity rejects rather than silently dropping records. `flush()` and
`stop()` report failures. A timed-out write aborts its signal and retires the
batch; the external effect may still be uncertain. Optional duck-typed
`budget.reserve({bytes, records})` returns a release function; reservations remain
held until the actual write settles. The application owns budget allocation.

`intervalSource` serializes asynchronous acceptance; `pollingSource` advances
its cursor only after all rows are accepted. Polling fetch receives
`(since, until, {signal})`. Stop fences late results. `deadline` only bounds
waiting and invokes a supplied cancellation callback; it does not guarantee
that an external operation was cancelled.

Legacy synchronous `batch`/`timedBatch` remain available. Use `boundedBatch`
when acceptance must await asynchronous delivery.

## Migration from 1.x

Version 2 removes all protocol and storage exports and their dependencies.
Import AMQP, MQTT, STOMP, serial, Modbus, Loki, PostgreSQL, ClickHouse and SQLite
adapters from `@yarkivaev/scada/streams`. For example:

```js
import { boundedBatch } from '@yarkivaev/source-to-sink';
import { mqttSource, clickhouseSink } from '@yarkivaev/scada/streams';
```

There are no compatibility re-exports: source-to-sink does not depend on scada.
Assignment management, checkpoint/outbox storage, reconnect policies and
protocol-specific acknowledgements belong to scada or application adapters.

## License

MIT
