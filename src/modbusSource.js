import ModbusRTU from 'modbus-serial';
import pollingSource from './pollingSource.js';
import deadline from './deadline.js';
import abortable from './abortable.js';

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
 * Destroys a Modbus client without throwing if already closed.
 *
 * @param {object} client - ModbusRTU client
 */
function drop(client) {
  if (client && typeof client.destroy === 'function') {
    client.destroy(() => {
      return undefined;
    });
  }
}

/**
 * Builds a ModbusRTU client for one connect attempt.
 *
 * @returns {object} Fresh ModbusRTU client
 */
function create() {
  return new ModbusRTU();
}

/**
 * Starts one connect attempt and ignores results after stop().
 *
 * @param {object} bag - Mutable lifecycle bag
 */
function attempt(bag) {
  const token = bag.epoch;
  bag.state = opening();
  drop(bag.client);
  const client = bag.create();
  bag.client = client;
  const connecting = bag.connect(client);
  void connecting.then(() => { if (token !== bag.epoch) { drop(client); } }).catch(() => { return undefined; });
  bag.opened = deadline(connecting, 5000, 'Modbus connect', (error) => {
    bag.fatal = error; bag.epoch += 1; drop(client);
  }).then(() => {
    if (token !== bag.epoch) {
      drop(client);
      return;
    }
    bag.delay = bag.interval;
    bag.state = connected(client);
    client.setTimeout(bag.interval * 1000);
    client.once('close', () => {
      if (token === bag.epoch && bag.client === client) { bag.lost(); }
    });
    void bag.source.start().catch((error) => { bag.fatal = error; drop(client); });
  }).catch((err) => {
    if (token !== bag.epoch) {
      return;
    }
    drop(bag.client);
    bag.log.error(`Connection to ${bag.target} failed, retrying in ${bag.delay}s: ${err.message}`);
    const handle = setTimeout(() => {
      attempt(bag);
    }, bag.delay * 1000);
    bag.state = retrying(handle);
    bag.delay = Math.min(bag.delay * 2, bag.maxDelay);
  });
}

/**
 * Resets a live session and retries through attempt() backoff.
 *
 * @param {object} bag - Mutable lifecycle bag
 */
function resume(bag) {
  if (!bag.state.connected()) {
    return;
  }
  const drained = bag.source.stop();
  const { client } = bag;
  bag.client = undefined;
  bag.state = idle();
  drop(client);
  bag.log.error(`Connection to ${bag.target} lost, retrying in ${bag.delay}s`);
  const token = bag.epoch;
  const handle = setTimeout(() => {
    void drained.then(() => { if (token === bag.epoch) { attempt(bag); } }).catch((error) => { bag.fatal = error; });
  }, bag.delay * 1000);
  bag.state = retrying(handle);
  bag.delay = Math.min(bag.delay * 2, bag.maxDelay);
}

/**
 * Shared Modbus polling lifecycle for TCP and RTU transports.
 *
 * @param {object} options - connect, target, address, count, interval, collector, clk, client, log
 * @returns {object} Source with start() and stop() methods
 */
function modbusPollingSource(options) {
  const { address, count, interval, collector, clk } = options;
  const bag = {
    ...options,
    client: undefined,
    state: idle(),
    epoch: 0,
    maxDelay: 300,
    delay: interval
  };
  bag.lost = function lost() {
    resume(bag);
  };
  async function fetch(since, until, { signal } = {}) {
    const { client } = bag;
    try {
      const result = await abortable(client.readHoldingRegisters(address, count), signal, () => { drop(client); });
      return [result.data];
    } catch (err) {
      if (bag.client === client) { bag.lost(); }
      throw err;
    }
  }
  bag.source = pollingSource(fetch, interval, collector, clk);
  return {
    /**
     * Connects to the Modbus device and starts polling.
     */
    start() {
      if (bag.fatal) { return Promise.reject(bag.fatal); }
      if (bag.state.connected() || bag.state.retrying() || bag.state.opening()) {
        return Promise.resolve();
      }
      const token = bag.epoch;
      bag.state = opening();
      return Promise.resolve(bag.stopping).then(() => { if (token === bag.epoch) { attempt(bag); } });
    },
    /**
     * Stops polling and disconnects from the Modbus device.
     */
    stop() {
      bag.epoch += 1;
      const drained = bag.source.stop();
      if (bag.state.retrying()) {
        bag.state.cancel();
      }
      const { client } = bag;
      bag.client = undefined;
      bag.state = idle();
      drop(client);
      bag.stopping = deadline(Promise.all([drained, bag.opened]), 5000, 'Modbus stop', (error) => { bag.fatal = error; }).then(() => {
        if (bag.fatal) { throw bag.fatal; }
      });
      return bag.stopping;
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
  function connect(modbusClient) {
    return modbusClient.connectTCP(host, { port });
  }
  return modbusPollingSource({
    create,
    connect,
    target: `${host}:${port}`,
    address,
    count,
    interval,
    collector,
    clk,
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
    create,
    connect,
    target: path,
    address,
    count,
    interval,
    collector,
    clk,
    log
  });
}
