/**
 * Fake clock for testing time-dependent code.
 *
 * Allows manual control of time for deterministic tests.
 * Use advance() to move time forward by a specific amount.
 *
 * @example
 * const clk = fakeClock(1000);
 * clk.millis(); // 1000
 * clk.advance(500);
 * clk.millis(); // 1500
 *
 * @param {number} [initial=0] - Initial time in milliseconds
 * @returns {object} Clock with millis() and advance() methods
 */
export default function fakeClock(initial = 0) {
  let time = initial;
  return {
    /**
     * Returns current fake time in milliseconds.
     *
     * @returns {number} Current fake time
     */
    millis() {
      return time;
    },
    /**
     * Advances fake time by specified milliseconds.
     *
     * @param {number} ms - Milliseconds to advance
     */
    advance(ms) {
      time += ms;
    }
  };
}
