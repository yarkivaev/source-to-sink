import assert from 'node:assert';
import { describe, it } from 'mocha';
import postgresSink from '../src/postgresSink.js';

describe('postgresSink', () => {
  it('throws on missing url', () => {
    assert.throws(
      () => postgresSink(null, 'metrics', ['ts', 'value']),
      /URL must be a non-empty string/,
      'Should reject missing url'
    );
  });

  it('throws on empty url', () => {
    assert.throws(
      () => postgresSink('', 'metrics', ['ts', 'value']),
      /URL must be a non-empty string/,
      'Should reject empty url'
    );
  });

  it('throws on missing table', () => {
    assert.throws(
      () => postgresSink('postgresql://localhost:5432/db', null, ['ts', 'value']),
      /Table must be a non-empty string/,
      'Should reject missing table'
    );
  });

  it('throws on empty table', () => {
    assert.throws(
      () => postgresSink('postgresql://localhost:5432/db', '', ['ts', 'value']),
      /Table must be a non-empty string/,
      'Should reject empty table'
    );
  });

  it('throws on missing columns', () => {
    assert.throws(
      () => postgresSink('postgresql://localhost:5432/db', 'metrics', null),
      /Columns must be a non-empty array/,
      'Should reject missing columns'
    );
  });

  it('throws on empty columns', () => {
    assert.throws(
      () => postgresSink('postgresql://localhost:5432/db', 'metrics', []),
      /Columns must be a non-empty array/,
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
});
