import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

// The one place a log line is trusted: anything that isn't this shape comes back null.
function parseLine(line: string): RunLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { at, job, status, owner, error } = parsed as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string') return null;
  if (status !== 'ok' && status !== 'retry' && status !== 'fail') return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status, owner, error };
}

// Plan morning-digest § 1. The log is append-only, so "last" means last in the file.
export const readNight: ReadNight = (runsDir, night) => {
  // Same shape as nightsOnDisk. This check is what keeps a name inside runsDir.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    const row: DigestRow = rows.get(line.job) ?? {
      job: line.job,
      owner: line.owner,
      runs: 0,
      retries: 0,
      fails: 0,
      lastStatus: line.status,
      lastError: null,
      firstAt: line.at,
      lastAt: line.at,
    };
    row.owner = line.owner;
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    if (line.status === 'fail') row.fails += 1;
    row.lastStatus = line.status;
    row.lastError = line.error ?? row.lastError; // a later ok doesn't clear it
    row.lastAt = line.at;
    rows.set(line.job, row);
  }

  // Plain compare, not localeCompare: the page and the JSON must agree on any machine.
  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines };
};
