import ModbusRTU from 'modbus-serial';
import pollingSource from './pollingSource.js';

/**
 * Idle state for Modbus connection.
 *
 * @returns {object} State with connected() returning false
 */
function idle() {
  return {
    connected() {
      return false;
    }
  };
}

/**
 * Connected state for Modbus connection.
 *
 * @param {object} client - ModbusRTU client
 * @returns {object} State with connected() returning true
 */
function connected(client) {
  return {
    connected() {
      return true;
    },
    disconnect() {
      client.close();
    }
  };
}

/**
 * Modbus TCP polling source for reading holding registers.
 *
 * Connects to a Modbus TCP device and polls holding registers
 * at a specified interval. Forwards register arrays to the
 * collector via pollingSource.
 *
 * @example
 * const source = modbusSource('192.168.2.148', 502, 4000, 14, 5, collector, clock);
 * source.start();
 * // ... later
 * source.stop();
 *
 * @param {string} host - Modbus TCP host address
 * @param {number} port - Modbus TCP port
 * @param {number} address - Starting register address
 * @param {number} count - Number of registers to read
 * @param {number} interval - Polling interval in seconds
 * @param {object} collector - Collector with accept() method
 * @param {object} clk - Clock with millis() method
 * @returns {object} Source with start() and stop() methods
 */
export default function modbusSource(host, port, address, count, interval, collector, clk) {
  if (typeof host !== 'string' || host.length === 0) {
    throw new Error('Host must be a non-empty string');
  }
  if (typeof port !== 'number' || port <= 0) {
    throw new Error(`Port must be a positive number, got: ${port}`);
  }
  if (typeof address !== 'number' || address < 0) {
    throw new Error(`Address must be a non-negative number, got: ${address}`);
  }
  if (typeof count !== 'number' || count <= 0) {
    throw new Error(`Count must be a positive number, got: ${count}`);
  }
  const client = new ModbusRTU();
  let state = idle();
  const fetch = async () => {
    const result = await client.readHoldingRegisters(address, count);
    return [result.data];
  };
  const source = pollingSource(fetch, interval, collector, clk);
  return {
    /**
     * Connects to the Modbus device and starts polling.
     */
    async start() {
      if (state.connected()) {
        return;
      }
      await client.connectTCP(host, { port });
      state = connected(client);
      source.start();
    },
    /**
     * Stops polling and disconnects from the Modbus device.
     */
    stop() {
      source.stop();
      if (state.connected()) {
        state.disconnect();
        state = idle();
      }
    }
  };
}
