# source-to-sink

A library for building data streaming pipelines with batching and circuit breaker support.

## Installation

```bash
npm install source-to-sink
```

## Usage

```javascript
import { batch, circuit, timedBatch, clock, clickhouseSink, mqttSource } from 'source-to-sink';

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

## License

MIT

### STOMP delivery window

`stompSource(url, destination, collector, { prefetch: 32 })` bounds broker deliveries
that are waiting for acknowledgement. The default is 32; use a positive safe
integer to tune throughput. A zero (unlimited) window is rejected because a
backlog can otherwise exhaust the consumer's heap. With `manualAck: true`, the
collector remains responsible for settling frames. If it flushes only by count,
its batch must not exceed the prefetch window; a timed flush also avoids stalls.
