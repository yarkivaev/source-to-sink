# source-to-sink

A lightweight library for building data streaming pipelines with batching and circuit breaker support.

## Installation

```bash
npm install source-to-sink
```

## Usage

```javascript
import { batch, circuit, timedBatch, clock, clickhouseSink, mqttSource } from 'source-to-sink';

const clk = clock();
const breaker = circuit(5, 60, clk);
const sink = clickhouseSink(clickhouseClient, 'metrics');
const collector = timedBatch(batch(sink, 1000, breaker), 5.0);
const source = mqttSource(mqttClient, 'sensors/#', collector);

source.start();
```

## Components

| Component | Description |
|-----------|-------------|
| `batch(sink, size, circuit)` | Collects records and flushes to sink when size is reached |
| `circuit(threshold, timeout, clock)` | Circuit breaker for failure isolation |
| `timedBatch(collector, interval)` | Adds time-based auto-flush to a collector |
| `clock()` | System time provider |
| `clickhouseSink(client, table)` | ClickHouse sink adapter |
| `mqttSource(client, topic, collector)` | MQTT subscription source |
| `lokiSource(client, query, interval, collector, clock)` | Loki polling source |

## License

MIT
