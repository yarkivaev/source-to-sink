import assert from 'node:assert';
import { describe, it } from 'mocha';
import clickhouseSink from '../src/clickhouseSink.js';

describe('clickhouseSink', () => {
  it('throws on missing url', () => {
    assert.throws(
      () => {return clickhouseSink(null, 'metrics')},
      /URL must be a non-empty string/u,
      'Should reject missing url'
    );
  });

  it('throws on empty url', () => {
    assert.throws(
      () => {return clickhouseSink('', 'metrics')},
      /URL must be a non-empty string/u,
      'Should reject empty url'
    );
  });

  it('throws on missing table', () => {
    assert.throws(
      () => {return clickhouseSink('http://localhost:8123', null)},
      /Table must be a non-empty string/u,
      'Should reject missing table'
    );
  });

  it('throws on empty table', () => {
    assert.throws(
      () => {return clickhouseSink('http://localhost:8123', '')},
      /Table must be a non-empty string/u,
      'Should reject empty table'
    );
  });

  it('returns sink with write method', () => {
    const sink = clickhouseSink('http://localhost:8123', 'metrics');
    assert.strictEqual(typeof sink.write, 'function', 'Should have write method');
  });
});
