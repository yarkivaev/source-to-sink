import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as streams from '../index.js';

describe('lightweight package boundary', () => {
    it('installs without runtime dependencies and exposes no protocol adapters', async () => {
        const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
        assert.deepEqual(metadata.dependencies ?? {}, {});
        assert.deepEqual(metadata.optionalDependencies ?? {}, {});
        assert.deepEqual(metadata.peerDependencies ?? {}, {});
        for (const name of ['amqpSource', 'mqttSource', 'stompSource', 'serialSource', 'modbusSource', 'lokiSource', 'postgresSink', 'clickhouseSink', 'sqliteSink']) {
            assert.equal(name in streams, false, `${name} belongs in scada`);
        }
        assert.equal(typeof streams.boundedBatch, 'function');
        assert.equal(typeof streams.pollingSource, 'function');
    });
});
