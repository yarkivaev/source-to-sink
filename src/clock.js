/**
 * Real clock implementation using system time.
 *
 * Provides current time in milliseconds for time-dependent operations.
 * Use fakeClock in tests to control time deterministically.
 *
 * @example
 * const clk = clock();
 * const now = clk.millis();
 *
 * @returns {object} Clock with millis() method
 */
export default function clock() {
  return {
    /**
     * Returns current time in milliseconds since epoch.
     *
     * @returns {number} Current time in milliseconds
     */
    millis() {
      return Date.now();
    }
  };
}
