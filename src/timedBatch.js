/**
 * Idle timer state with no scheduled flush.
 *
 * @returns {object} State with scheduled() returning false
 */
function idle() {
  return {
    scheduled() {
      return false;
    },
    cancel() {
      /* nothing to cancel */
    }
  };
}

/**
 * Active timer state with scheduled flush.
 *
 * @param {object} handle - Timer handle from setTimeout
 * @returns {object} State with scheduled() returning true
 */
function scheduled(handle) {
  return {
    scheduled() {
      return true;
    },
    cancel() {
      clearTimeout(handle);
    }
  };
}

/**
 * Decorator that adds time-based flushing to a collector.
 *
 * Wraps a collector and schedules automatic flushes after
 * a specified interval. The timer is reset on each accept call.
 *
 * @example
 * const sink = { write: (records) => console.log(records) };
 * const b = batch(sink, 100);
 * const timed = timedBatch(b, 1.0);
 * timed.accept({ value: 42 });
 * // Will auto-flush after 1 second
 * timed.stop();
 *
 * @param {object} origin - Underlying collector with accept(), flush(), stop()
 * @param {number} interval - Seconds before automatic flush
 * @returns {object} Timed collector with accept(), flush(), and stop() methods
 */
export default function timedBatch(origin, interval) {
  if (!origin || typeof origin.accept !== 'function') {
    throw new Error('Origin must have an accept() method');
  }
  if (!origin || typeof origin.flush !== 'function') {
    throw new Error('Origin must have a flush() method');
  }
  if (!origin || typeof origin.stop !== 'function') {
    throw new Error('Origin must have a stop() method');
  }
  if (typeof interval !== 'number' || interval <= 0) {
    throw new Error(`Interval must be a positive number, got: ${interval}`);
  }
  let timer = idle();
  const schedule = () => {
    if (!timer.scheduled()) {
      const handle = setTimeout(() => {
        timer = idle();
        origin.flush();
      }, interval * 1000);
      timer = scheduled(handle);
    }
  };
  const cancel = () => {
    timer.cancel();
    timer = idle();
  };
  return {
    /**
     * Accepts a record and schedules flush timer.
     *
     * @param {*} record - Record to accept
     */
    accept(record) {
      origin.accept(record);
      schedule();
    },
    /**
     * Flushes and cancels pending timer.
     */
    flush() {
      cancel();
      origin.flush();
    },
    /**
     * Stops timer and underlying collector.
     */
    stop() {
      cancel();
      origin.stop();
    }
  };
}
