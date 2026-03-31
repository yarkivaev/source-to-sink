import assert from 'node:assert';
import { describe, it } from 'mocha';
import postgresSink, { deduplicate } from '../src/postgresSink.js';

describe('postgresSink', () => {
  it('throws on missing url', () => {
    assert.throws(
      () => {return postgresSink(null, 'metrics', ['ts', 'value'])},
      /URL must be a non-empty string/u,
      'Should reject missing url'
    );
  });

  it('throws on empty url', () => {
    assert.throws(
      () => {return postgresSink('', 'metrics', ['ts', 'value'])},
      /URL must be a non-empty string/u,
      'Should reject empty url'
    );
  });

  it('throws on missing table', () => {
    assert.throws(
      () => {return postgresSink('postgresql://localhost:5432/db', null, ['ts', 'value'])},
      /Table must be a non-empty string/u,
      'Should reject missing table'
    );
  });

  it('throws on empty table', () => {
    assert.throws(
      () => {return postgresSink('postgresql://localhost:5432/db', '', ['ts', 'value'])},
      /Table must be a non-empty string/u,
      'Should reject empty table'
    );
  });

  it('throws on missing columns', () => {
    assert.throws(
      () => {return postgresSink('postgresql://localhost:5432/db', 'metrics', null)},
      /Columns must be a non-empty array/u,
      'Should reject missing columns'
    );
  });

  it('throws on empty columns', () => {
    assert.throws(
      () => {return postgresSink('postgresql://localhost:5432/db', 'metrics', [])},
      /Columns must be a non-empty array/u,
      'Should reject empty columns'
    );
  });

  it('returns sink with write method', () => {
    const sink = postgresSink('postgresql://localhost:5432/db', 'metrics', ['ts', 'value']);
    assert.strictEqual(typeof sink.write, 'function', 'Should have write method');
  });

  it('returns sink with write method when conflict option is provided', () => {
    const sink = postgresSink('postgresql://localhost:5432/db', 'segments',
      ['machine', 'name', 'start_time'], { conflict: ['machine', 'start_time'] });
    assert.strictEqual(typeof sink.write, 'function', 'Should have write method with conflict option');
  });

  it('returns sink with write method when conflict option is empty array', () => {
    const sink = postgresSink('postgresql://localhost:5432/db', 'metrics',
      ['ts', 'value'], { conflict: [] });
    assert.strictEqual(typeof sink.write, 'function', 'Should have write method with empty conflict');
  });

  it('returns sink with write method when options has no conflict key', () => {
    const sink = postgresSink('postgresql://localhost:5432/db', 'metrics',
      ['ts', 'value'], {});
    assert.strictEqual(typeof sink.write, 'function', 'Should have write method without conflict key');
  });

  it('returns sink with write method when conflict and update options are provided', () => {
    const sink = postgresSink('postgresql://localhost:5432/db', 'segments',
      ['machine', 'name', 'start_time', 'end_time', 'duration'],
      { conflict: ['machine', 'start_time'], update: ['name', 'end_time', 'duration'] });
    assert.strictEqual(typeof sink.write, 'function', 'Should have write method with update option');
  });

  it('deduplicates batch by conflict columns keeping last occurrence', () => {
    const records = [
      { machine: 'ü-1', name: 'pending', start_time: '2024-01-01' },
      { machine: 'ü-1', name: 'completed', start_time: '2024-01-01' },
      { machine: 'ö-2', name: 'pending', start_time: '2024-01-02' }
    ];
    const result = deduplicate(records, ['machine', 'start_time']);
    assert.strictEqual(result.length, 2, 'Should remove duplicate conflict key');
  });

  it('keeps last record when conflict columns match', () => {
    const records = [
      { machine: 'ü-1', name: 'pending', start_time: '2024-01-01' },
      { machine: 'ü-1', name: 'completed', start_time: '2024-01-01' }
    ];
    const result = deduplicate(records, ['machine', 'start_time']);
    assert.strictEqual(result[0].name, 'completed', 'Should keep the last occurrence');
  });

  it('returns records unchanged when no conflict columns', () => {
    const records = [
      { machine: 'ä-1', name: 'à', start_time: '2024-01-01' },
      { machine: 'ä-1', name: 'à', start_time: '2024-01-01' }
    ];
    const result = deduplicate(records, []);
    assert.strictEqual(result.length, 2, 'Should not deduplicate without conflict columns');
  });
});
