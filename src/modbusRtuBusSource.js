import ModbusRTU from 'modbus-serial';

/**
 * Validates RTU bus source arguments.
 *
 * @param {string} path - Serial device path
 * @param {object} serial - Serial options with baudRate
 * @param {Array} slaves - Slave descriptors
 */
function assertBusArgs(path, serial, slaves) {
    if (typeof path !== 'string' || path.length === 0) {
        throw new Error('Serial path must be a non-empty string');
    }
    if (!serial || typeof serial.baudRate !== 'number' || serial.baudRate <= 0) {
        throw new Error('Serial baudRate must be a positive number');
    }
    if (!Array.isArray(slaves) || slaves.length === 0) {
        throw new Error('Slaves must be a non-empty array');
    }
}

/**
 * Reads one slave holding-register block and forwards it to its collector.
 *
 * @param {object} client - ModbusRTU client
 * @param {object} slave - slaveId and collector
 * @param {number} address - PDU start address
 * @param {number} count - Register count
 * @returns {Promise<void>}
 */
function readSlave(client, slave, address, count) {
    client.setID(slave.slaveId);
    return client.readHoldingRegisters(address, count).then((result) => {
        slave.collector.accept(result.data);
    });
}

/**
 * Polls all slaves on the bus sequentially.
 *
 * @param {object} client - ModbusRTU client
 * @param {Array} slaves - Slave descriptors
 * @param {number} address - PDU start address
 * @param {number} count - Register count
 * @returns {Promise<void>}
 */
function pollSlaves(client, slaves, address, count) {
    return slaves.reduce((chain, slave) => {
        return chain.then(() => {
            return readSlave(client, slave, address, count);
        });
    }, Promise.resolve());
}

/**
 * Modbus RTU bus source: one serial port, several slave IDs polled in sequence.
 *
 * @example
 * const source = modbusRtuBusSource(
 *   '/dev/ttyUSB0',
 *   { baudRate: 9600, stopBits: 2, parity: 'none' },
 *   [{ slaveId: 1, collector: t1 }, { slaveId: 2, collector: t2 }],
 *   { address: 1280, count: 30, interval: 5 }
 * );
 * source.start();
 *
 * @param {string} path - Serial device path
 * @param {object} serial - baudRate, dataBits, stopBits, parity
 * @param {Array<{slaveId: number, collector: object}>} slaves - Slave poll targets
 * @param {object} poll - address, count, interval, optional log
 * @returns {object} Source with start() and stop()
 */
export default function modbusRtuBusSource(path, serial, slaves, poll) {
    assertBusArgs(path, serial, slaves);
    const log = poll.log || console;
    const client = new ModbusRTU();
    const line = {
        baudRate: serial.baudRate,
        dataBits: serial.dataBits || 8,
        stopBits: serial.stopBits || 1,
        parity: serial.parity || 'none'
    };
    let handle = null;
    let opened = false;
    function runPoll() {
        pollSlaves(client, slaves, poll.address, poll.count).catch((err) => {
            log.error(`RTU bus poll on ${path} failed: ${err.message}`);
        });
    }
    function attempt() {
        client.connectRTUBuffered(path, line).then(() => {
            opened = true;
            handle = setInterval(runPoll, poll.interval * 1000);
            runPoll();
        }).catch((err) => {
            log.error(`Connection to ${path} failed, retrying: ${err.message}`);
            handle = setTimeout(attempt, poll.interval * 1000);
        });
    }
    return {
        start() {
            if (!(opened || handle)) {
                attempt();
            }
        },
        stop() {
            if (handle) {
                clearInterval(handle);
                clearTimeout(handle);
                handle = null;
            }
            if (opened) {
                client.close();
                opened = false;
            }
        }
    };
}
