/**
 * Closed circuit state allowing operations.
 *
 * @returns {object} State with allowing() returning true
 */
function closed() {
  return {
    allowing() {
      return true;
    }
  };
}

/**
 * Open circuit state blocking operations.
 *
 * @param {number} timestamp - When the circuit was opened
 * @param {object} clk - Clock for time tracking
 * @param {number} timeout - Seconds before expiration
 * @returns {object} State with allowing() and expired()
 */
function open(timestamp, clk, timeout) {
  return {
    allowing() {
      return false;
    },
    expired() {
      return (clk.millis() - timestamp) / 1000 >= timeout;
    }
  };
}

/**
 * Circuit breaker for failure isolation in data pipelines.
 *
 * Implements the circuit breaker pattern to prevent cascading failures.
 * The circuit opens after a threshold of failures and closes after a timeout.
 *
 * @example
 * const clk = clock();
 * const c = circuit(5, 60, clk);
 * if (c.allowing()) {
 *   try {
 *     await riskyOperation();
 *     c.succeed();
 *   } catch (err) {
 *     c.fail();
 *   }
 * }
 *
 * @param {number} threshold - Number of failures before opening the circuit
 * @param {number} timeout - Seconds to wait before attempting recovery
 * @param {object} clk - Clock with millis() method for time tracking
 * @returns {object} Circuit breaker with allowing(), succeed(), and fail() methods
 */
export default function circuit(threshold, timeout, clk) {
  if (typeof threshold !== 'number' || threshold < 1) {
    throw new Error(`Threshold must be a positive number, got: ${threshold}`);
  }
  if (typeof timeout !== 'number' || timeout < 0) {
    throw new Error(`Timeout must be a non-negative number, got: ${timeout}`);
  }
  if (!clk || typeof clk.millis !== 'function') {
    throw new Error('Clock must have a millis() method');
  }
  let failures = 0;
  let state = closed();
  return {
    /**
     * Checks if the circuit allows operations.
     *
     * @returns {boolean} True if circuit allows operations, false if open
     */
    allowing() {
      if (state.allowing()) {
        return true;
      }
      if (state.expired()) {
        state = closed();
        failures = 0;
        return true;
      }
      return false;
    },
    /**
     * Records a successful operation, resetting the failure count.
     */
    succeed() {
      failures = 0;
      state = closed();
    },
    /**
     * Records a failed operation, potentially opening the circuit.
     */
    fail() {
      failures += 1;
      if (failures >= threshold) {
        state = open(clk.millis(), clk, timeout);
      }
    }
  };
}
