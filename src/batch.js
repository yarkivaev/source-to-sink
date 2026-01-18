/**
 * Batch collector that accumulates records and flushes to a sink.
 *
 * Collects records until batch size is reached, then flushes to
 * the configured sink. Uses circuit breaker for failure isolation.
 * For time-based flushing, wrap with timedBatch.
 *
 * @example
 * const sink = { write: (records) => console.log(records) };
 * const clk = clock();
 * const c = circuit(5, 60, clk);
 * const b = batch(sink, 100, c);
 * b.accept({ value: 42 });
 * b.flush();
 * b.stop();
 *
 * @param {object} sink - Object with write(records) method
 * @param {number} size - Maximum batch size before automatic flush
 * @param {object} circuit - Circuit breaker with allowing(), succeed(), fail()
 * @returns {object} Batch collector with accept(), flush(), and stop() methods
 */
export default function batch(sink, size, circuit) {
  if (!sink || typeof sink.write !== 'function') {
    throw new Error('Sink must have a write(records) method');
  }
  if (typeof size !== 'number' || size < 1) {
    throw new Error(`Size must be a positive number, got: ${size}`);
  }
  if (!circuit || typeof circuit.allowing !== 'function') {
    throw new Error('Circuit must have an allowing() method');
  }
  let records = [];
  const perform = () => {
    if (records.length === 0) {
      return;
    }
    if (!circuit.allowing()) {
      return;
    }
    const pending = records;
    try {
      sink.write(pending);
      records = [];
      circuit.succeed();
    } catch (err) {
      circuit.fail();
      throw err;
    }
  };
  return {
    /**
     * Accepts a record into the batch.
     *
     * @param {*} record - Record to accept
     */
    accept(record) {
      records.push(record);
      if (records.length >= size) {
        perform();
      }
    },
    /**
     * Forces an immediate flush of all pending records.
     */
    flush() {
      perform();
    },
    /**
     * Stops the batch collector and clears pending records.
     */
    stop() {
      records = [];
    }
  };
}
