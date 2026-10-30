import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const FULL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-10-25';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

let runsDir: string;

function line(job: string, status: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ at: '2026-10-28T23:00:00+01:00', job, status, owner: 'rook', ...extra });
}

// Written out of sorted order on purpose: the routes must sort the jobs.
const FIXTURE = [
  line('notes/backup', 'retry'),
  line('lane/sync', 'fail', { error: 'boom' }),
  line('notes/backup', 'retry'),
  line('digest/render', 'ok'),
  line('notes/backup', 'retry'),
];

function night(name: string, body: string): void {
  writeFileSync(join(runsDir, `${name}.jsonl`), body);
}

function get(path: string) {
  return createApp({ ...config, runsDir }).request(path);
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  mkdirSync(runsDir, { recursive: true });
  night(FULL, FIXTURE.join('\n'));
  night(EMPTY, '');
  night(BAD, [...FIXTURE, 'not json'].join('\n'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('shows the jobs, sorted, and the bad line count', async () => {
    const res = await get(`/digest/${FULL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest ${FULL}`);
    expect(html).toContain('digest/render');
    expect(html).toContain('lane/sync');
    expect(html).toContain('notes/backup');
    expect(html).toContain('bad lines: 0');
  });

  it('marks a failed job and a job with 3+ retries', async () => {
    const html = await (await get(`/digest/${FULL}`)).text();
    expect(html).toContain('failed');
    expect(html).toContain('3+ retries');
  });

  it('says nothing ran for an empty night', async () => {
    const res = await get(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).toContain('bad lines: 0');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await get(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no such night');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON', async () => {
    const res = await get(`/api/digest/${FULL}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ night: FULL, badLines: 0 });
    expect(body.rows).toHaveLength(3);
  });

  it('returns no rows for an empty night', async () => {
    const res = await get(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await get(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });
});

describe('both routes', () => {
  it('keep the good rows and count the bad line', async () => {
    const page = await get(`/digest/${BAD}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('bad lines: 1');

    const json = await get(`/api/digest/${BAD}`);
    expect(json.status).toBe(200);
    const body = await json.json();
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['digest/render', 'lane/sync', 'notes/backup']);
  });

  it('answer 404 for a malformed night name', async () => {
    expect((await get('/digest/not-a-night')).status).toBe(404);
    expect((await get('/api/digest/not-a-night')).status).toBe(404);
  });

  it('agree on jobs and their order', async () => {
    const html = await (await get(`/digest/${FULL}`)).text();
    const body = await (await get(`/api/digest/${FULL}`)).json();
    const positions = body.rows.map((r: { job: string }) => html.indexOf(r.job));
    expect(positions.every((p: number) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
