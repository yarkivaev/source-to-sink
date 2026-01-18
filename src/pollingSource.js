/**
 * Idle state for polling source.
 *
 * @returns {object} State with polling() returning false
 */
function idle() {
  return {
    polling() {
      return false;
    }
  };
}

/**
 * Polling state for polling source.
 *
 * @param {object} handle - Timer handle from setInterval
 * @returns {object} State with polling() returning true
 */
function polling(handle) {
  return {
    polling() {
      return true;
    },
    cancel() {
      clearInterval(handle);
    }
  };
}

/**
 * Generic polling source with time window tracking.
 *
 * Polls at a specified interval and forwards records to
 * the collector. Tracks time windows to avoid duplicates.
 *
 * @example
 * const fetch = async (since, until) => {
 *   return await api.query(since, until);
 * };
 * const source = pollingSource(fetch, 10, collector, clock);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {function} fetch - Async function(since, until) returning array
 * @param {number} interval - Polling interval in seconds
 * @param {object} collector - Collector with accept() method
 * @param {object} clk - Clock with millis() method
 * @returns {object} Source with start() and stop() methods
 */
export default function pollingSource(fetch, interval, collector, clk) {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch must be a function');
  }
  if (typeof interval !== 'number' || interval <= 0) {
    throw new Error(`Interval must be a positive number, got: ${interval}`);
  }
  if (!collector || typeof collector.accept !== 'function') {
    throw new Error('Collector must have an accept() method');
  }
  if (!clk || typeof clk.millis !== 'function') {
    throw new Error('Clock must have a millis() method');
  }
  let state = idle();
  let since = clk.millis();
  const poll = async () => {
    const until = clk.millis();
    const result = await fetch(since, until);
    since = until;
    for (const entry of result) {
      collector.accept(entry);
    }
  };
  return {
    /**
     * Starts polling.
     */
    start() {
      if (state.polling()) {
        return;
      }
      since = clk.millis();
      const handle = setInterval(poll, interval * 1000);
      state = polling(handle);
    },
    /**
     * Stops polling.
     */
    stop() {
      if (!state.polling()) {
        return;
      }
      state.cancel();
      state = idle();
    }
  };
}
