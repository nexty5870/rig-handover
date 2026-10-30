import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const NIGHT = '2026-10-28';

let root: string;
let runsDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  runsDir = join(root, 'runs');
  mkdirSync(runsDir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function line(job: string, status: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job, status, owner: 'rook', ...extra });
}

function write(...lines: string[]): void {
  writeFileSync(join(runsDir, `${NIGHT}.jsonl`), lines.join('\n'));
}

function read() {
  const digest = readNight(runsDir, NIGHT);
  if (digest === null) throw new Error('expected a night');
  return digest;
}

describe('readNight on a real night', () => {
  const digest = readNight('runs', NIGHT);
  const row = (job: string) => digest?.rows.find((r) => r.job === job);

  it('finds 5 jobs and 1 bad line, sorted by job', () => {
    expect(digest?.night).toBe(NIGHT);
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('keeps the last error after a later ok', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('counts fails', () => {
    expect(row('notes/backup')).toMatchObject({ fails: 1, lastStatus: 'fail' });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, lastError: null });
  });
});

describe('readNight edge cases', () => {
  it('returns null when the night has no file', () => {
    expect(readNight(runsDir, NIGHT)).toBeNull();
  });

  it('returns null for a name that is not YYYY-MM-DD', () => {
    write(line('a', 'ok'));
    for (const night of ['', 'latest', '2026-10-2', '2026-10-28.jsonl', `${NIGHT}\n`, ` ${NIGHT}`]) {
      expect(readNight(runsDir, night)).toBeNull();
    }
  });

  it('never reads outside runsDir, even when the target exists', () => {
    writeFileSync(join(root, `${NIGHT}.jsonl`), line('outside', 'ok'));
    writeFileSync(join(root, 'secret.jsonl'), line('outside', 'ok'));
    const escapes = [
      `../${NIGHT}`,
      '../secret',
      `x/../../${NIGHT}`,
      join(root, NIGHT),
      `${NIGHT}\n/../../secret`,
    ];
    for (const night of escapes) {
      expect(readNight(runsDir, night)).toBeNull();
    }
  });

  it('returns empty rows for an empty file', () => {
    write('');
    expect(read()).toEqual({ night: NIGHT, rows: [], badLines: 0 });
  });

  it('does not count blank lines', () => {
    write('', line('a', 'ok'), '   ', '', line('a', 'ok'), '');
    expect(read()).toMatchObject({ badLines: 0, rows: [{ job: 'a', runs: 2 }] });
  });

  it('reads CRLF line endings', () => {
    write(`${line('a', 'ok')}\r`, '\r', `${line('b', 'ok')}\r`, '');
    expect(read()).toMatchObject({ badLines: 0, rows: [{ job: 'a' }, { job: 'b' }] });
  });

  it('counts lines that do not parse', () => {
    write(line('a', 'ok'), '{"at":"2026-10-28T23:00:00+01:00","job":"a', 'not json');
    expect(read()).toMatchObject({ badLines: 2, rows: [{ job: 'a', runs: 1 }] });
  });

  it('counts lines that parse but have the wrong shape', () => {
    write(
      'null',
      '42',
      '"ok"',
      '[]',
      '{}',
      line('a', 'ok', { at: undefined }),
      line('a', 'ok', { owner: undefined }),
      line('a', 'skipped'),
      line('a', 'ok', { job: 7 }),
      line('a', 'ok', { at: 1761688800 }),
      line('a', 'ok', { owner: 7 }),
      line('a', 'ok', { error: 503 }),
    );
    expect(read()).toEqual({ night: NIGHT, rows: [], badLines: 12 });
  });

  it('takes the most recent error, and keeps it through a line without one', () => {
    write(
      line('a', 'retry', { error: 'first' }),
      line('a', 'retry', { error: 'second' }),
      line('a', 'ok'),
    );
    expect(read().rows[0]).toMatchObject({ lastStatus: 'ok', lastError: 'second' });
  });

  it('leaves times as written and takes first and last by job', () => {
    write(
      line('a', 'ok', { at: '2026-10-28T23:00:00+01:00' }),
      line('b', 'ok', { at: '2026-10-28T23:30:00-05:00' }),
      line('a', 'ok', { at: '2026-10-29T01:00:00+01:00' }),
    );
    expect(read().rows).toMatchObject([
      { job: 'a', firstAt: '2026-10-28T23:00:00+01:00', lastAt: '2026-10-29T01:00:00+01:00' },
      { job: 'b', firstAt: '2026-10-28T23:30:00-05:00', lastAt: '2026-10-28T23:30:00-05:00' },
    ]);
  });

  it('sorts with a plain string compare', () => {
    write(line('b', 'ok'), line('a', 'ok'), line('Z', 'ok'), line('a-b', 'ok'), line('a/b', 'ok'));
    expect(read().rows.map((r) => r.job)).toEqual(['Z', 'a', 'a-b', 'a/b', 'b']);
  });

  it('handles a job named like an Object.prototype key', () => {
    write(line('__proto__', 'ok'), line('constructor', 'fail'));
    expect(read().rows).toMatchObject([
      { job: '__proto__', runs: 1 },
      { job: 'constructor', fails: 1 },
    ]);
  });
});
