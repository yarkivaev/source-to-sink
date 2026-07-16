import assert from 'node:assert';
import { describe, it } from 'mocha';
import modbusRtuBusSource from '../src/modbusRtuBusSource.js';

describe('modbusRtuBusSource', () => {
    it('throws on empty serial path', () => {
        assert.throws(
            () => {
                return modbusRtuBusSource('', { baudRate: 9600 }, [{ slaveId: 1, collector: { accept() {} } }], {
                    address: 1280,
                    count: 30,
                    interval: 5
                });
            },
            /Serial path must be a non-empty string/u,
            'Should reject empty serial path'
        );
    });

    it('throws on empty slaves list', () => {
        assert.throws(
            () => {
                return modbusRtuBusSource(`/dev/ttyUSB${Math.floor(Math.random() * 9)}`, { baudRate: 9600 }, [], {
                    address: 1280,
                    count: 30,
                    interval: 5
                });
            },
            /Slaves must be a non-empty array/u,
            'Should reject empty slaves array'
        );
    });

    it('creates source with start method for multiple slaves', () => {
        const path = `/dev/ttyUSB${Math.floor(Math.random() * 9)}`;
        const source = modbusRtuBusSource(
            path,
            { baudRate: 9600, stopBits: 2 },
            [
                { slaveId: 1, collector: { accept() {} } },
                { slaveId: 2, collector: { accept() {} } }
            ],
            { address: 1280, count: 30, interval: 5 }
        );
        assert.strictEqual(typeof source.start, 'function', 'Should expose start for RTU bus source');
    });
});
