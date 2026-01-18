/**
 * Idle state for Loki source.
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
 * Polling state for Loki source.
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
 * Loki polling source for streaming log entries to a collector.
 *
 * Polls Loki at a specified interval and forwards log entries
 * to the collector.
 *
 * @example
 * const source = lokiSource(lokiClient, '{app="traefik"}', 10, collector, clock);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {object} client - Loki client with query() method
 * @param {string} query - LogQL query string
 * @param {number} interval - Polling interval in seconds
 * @param {object} collector - Collector with accept() method
 * @param {object} clk - Clock with millis() method
 * @returns {object} Source with start() and stop() methods
 */
export default function lokiSource(client, query, interval, collector, clk) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Client must have a query() method');
  }
  if (typeof query !== 'string' || query.length === 0) {
    throw new Error('Query must be a non-empty string');
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
    const result = await client.query(query, since, until);
    since = until;
    for (const entry of result) {
      collector.accept(entry);
    }
  };
  return {
    /**
     * Starts polling Loki for log entries.
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
     * Stops polling Loki.
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
