/**
 * Source-to-sink streaming library.
 *
 * Provides components for building data streaming pipelines:
 * - batch: Collects records and flushes to sink
 * - circuit: Circuit breaker for failure isolation
 * - timedBatch: Decorator for time-based flushing
 * - clock: Time provider for circuit breaker
 * - pollingSource: Generic polling source with time window
 * - clickhouseSink: ClickHouse sink (accepts URL)
 * - mqttSource: MQTT subscription source (accepts URL)
 * - lokiSource: Loki polling source (accepts URL)
 *
 * @example
 * import { batch, circuit, timedBatch, clock, clickhouseSink, mqttSource } from 'source-to-sink';
 *
 * const clk = clock();
 * const c = circuit(5, 60, clk);
 * const sink = clickhouseSink('http://localhost:8123', 'metrics');
 * const collector = timedBatch(batch(sink, 1000, c), 5.0);
 * const source = mqttSource('mqtt://localhost:1883', 'sensors/#', collector);
 * source.start();
 */
export { default as batch } from './src/batch.js';
export { default as circuit } from './src/circuit.js';
export { default as clock } from './src/clock.js';
export { default as timedBatch } from './src/timedBatch.js';
export { default as pollingSource } from './src/pollingSource.js';
export { default as clickhouseSink } from './src/clickhouseSink.js';
export { default as mqttSource } from './src/mqttSource.js';
export { default as lokiSource } from './src/lokiSource.js';
