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
 * - postgresSink: PostgreSQL sink (accepts URL)
 * - mqttSource: MQTT subscription source (accepts URL)
 * - stompSource: STOMP subscription source (accepts URL)
 * - stompSend: one-shot STOMP publish (accepts URL)
 * - lokiSource: Loki polling source (accepts URL)
 * - modbusSource: Modbus TCP polling source (accepts host/port)
 * - modbusRtuSource: Modbus RTU polling source (accepts serial path)
 * - mqttSink: MQTT publishing sink (accepts URL)
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
export { default as postgresSink } from './src/postgresSink.js';
export { default as mqttSource } from './src/mqttSource.js';
export { default as stompSource } from './src/stompSource.js';
export { default as stompSend } from './src/stompSend.js';
export { default as lokiSource } from './src/lokiSource.js';
export { default as modbusSource, modbusRtuSource } from './src/modbusSource.js';
export { default as mqttSink } from './src/mqttSink.js';
export { default as sqliteSink } from './src/sqliteSink.js';
