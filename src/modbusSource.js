import ModbusRTU from 'modbus-serial';
import pollingSource from './pollingSource.js';

/**
 * Idle state for Modbus connection.
 *
 * @returns {object} State with no open attempt
 */
function idle() {
  return {
    connected() {
      return false;
    },
    retrying() {
      return false;
    },
    opening() {
      return false;
    }
  };
}

/**
 * Retrying state for Modbus connection.
 *
 * @param {object} handle - Timer handle from setTimeout
 * @returns {object} State with retrying() returning true
 */
function retrying(handle) {
  return {
    connected() {
      return false;
    },
    retrying() {
      return true;
    },
    opening() {
      return false;
    },
    cancel() {
      clearTimeout(handle);
    }
  };
}

/**
 * In-flight TCP or RTU connect state.
 *
 * @returns {object} State with opening() returning true
 */
function opening() {
  return {
    connected() {
      return false;
    },
    retrying() {
      return false;
    },
    opening() {
      return true;
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
    retrying() {
      return false;
    },
    opening() {
      return false;
    },
    disconnect() {
      client.close();
    }
  };
}

/**
 * Starts one connect attempt and ignores results after stop().
 *
 * @param {object} bag - Mutable lifecycle bag
 */
function attempt(bag) {
  const token = bag.epoch;
  bag.state = opening();
  bag.connect(bag.client).then(() => {
    if (token !== bag.epoch) {
      bag.client.close();
      return;
    }
    bag.delay = bag.interval;
    bag.state = connected(bag.client);
    bag.source.start();
  }).catch((err) => {
    if (token !== bag.epoch) {
      return;
    }
    bag.log.error(`Connection to ${bag.target} failed, retrying in ${bag.delay}s: ${err.message}`);
    const handle = setTimeout(() => {
      attempt(bag);
    }, bag.delay * 1000);
    bag.state = retrying(handle);
    bag.delay = Math.min(bag.delay * 2, bag.maxDelay);
  });
}

/**
 * Shared Modbus polling lifecycle for TCP and RTU transports.
 *
 * @param {object} options - connect, target, address, count, interval, collector, clk, client, log
 * @returns {object} Source with start() and stop() methods
 */
function modbusPollingSource(options) {
  const { address, count, interval, collector, clk, client } = options;
  async function fetch() {
    const result = await client.readHoldingRegisters(address, count);
    return [result.data];
  }
  const bag = {
    ...options,
    state: idle(),
    epoch: 0,
    maxDelay: 300,
    source: pollingSource(fetch, interval, collector, clk),
    delay: interval
  };
  return {
    /**
     * Connects to the Modbus device and starts polling.
     */
    start() {
      if (bag.state.connected() || bag.state.retrying() || bag.state.opening()) {
        return;
      }
      attempt(bag);
    },
    /**
     * Stops polling and disconnects from the Modbus device.
     */
    stop() {
      bag.epoch += 1;
      bag.source.stop();
      if (bag.state.retrying()) {
        bag.state.cancel();
      }
      if (bag.state.connected() || bag.state.opening()) {
        bag.client.close();
      }
      bag.state = idle();
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
 *
 * @param {string} host - Modbus TCP host address
 * @param {number} port - Modbus TCP port
 * @param {number} address - Starting register address
 * @param {number} count - Number of registers to read
 * @param {number} interval - Polling interval in seconds
 * @param {object} collector - Collector with accept() method
 * @param {object} clk - Clock with millis() method
 * @param {object} [log] - Logger with error() method for connection failures
 * @returns {object} Source with start() and stop() methods
 */
export default function modbusSource(host, port, address, count, interval, collector, clk, log = console) {
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
  function connect(modbusClient) {
    return modbusClient.connectTCP(host, { port });
  }
  return modbusPollingSource({
    connect,
    target: `${host}:${port}`,
    address,
    count,
    interval,
    collector,
    clk,
    client,
    log
  });
}

/**
 * Modbus RTU polling source for reading holding registers over serial.
 *
 * Connects to a Modbus RTU device on a serial port and polls holding registers
 * at a specified interval. Forwards register arrays to the collector via pollingSource.
 *
 * @example
 * const source = modbusRtuSource('/dev/ttyUSB0', { baudRate: 9600, slaveId: 1 }, 4000, 44, 5, collector, clock);
 * source.start();
 *
 * @param {string} path - Serial device path (e.g. /dev/ttyUSB0)
 * @param {object} serial - baudRate, dataBits, stopBits, parity, slaveId
 * @param {number} address - Starting register address
 * @param {number} count - Number of registers to read
 * @param {number} interval - Polling interval in seconds
 * @param {object} collector - Collector with accept() method
 * @param {object} clk - Clock with millis() method
 * @param {object} [log] - Logger with error() method for connection failures
 * @returns {object} Source with start() and stop() methods
 */
export function modbusRtuSource(path, serial, address, count, interval, collector, clk, log = console) {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Serial path must be a non-empty string');
  }
  if (!serial || typeof serial !== 'object') {
    throw new Error('Serial config must be an object');
  }
  if (typeof serial.baudRate !== 'number' || serial.baudRate <= 0) {
    throw new Error(`Baud rate must be a positive number, got: ${serial.baudRate}`);
  }
  if (typeof address !== 'number' || address < 0) {
    throw new Error(`Address must be a non-negative number, got: ${address}`);
  }
  if (typeof count !== 'number' || count <= 0) {
    throw new Error(`Count must be a positive number, got: ${count}`);
  }
  const client = new ModbusRTU();
  const slaveId = serial.slaveId || 1;
  const dataBits = serial.dataBits || 8;
  const stopBits = serial.stopBits || 1;
  const parity = serial.parity || 'none';
  function connect(modbusClient) {
    return modbusClient.connectRTUBuffered(path, {
      baudRate: serial.baudRate,
      dataBits,
      stopBits,
      parity
    }).then(() => {
      modbusClient.setID(slaveId);
    });
  }
  return modbusPollingSource({
    connect,
    target: path,
    address,
    count,
    interval,
    collector,
    clk,
    client,
    log
  });
}
