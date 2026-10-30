import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { readNight } from './digest/read.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  counts: Record<string, NightCounts | null>;
};

export type NightCounts = { ok: number; retry: number; fail: number };

// null: the night's file can't be read.
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  const n = readNight(runsDir, night);
  if (n === null) return null;
  let runs = 0;
  let retry = 0;
  let fail = 0;
  for (const r of n.rows) {
    runs += r.runs;
    retry += r.retries;
    fail += r.fails;
  }
  return { ok: runs - retry - fail, retry, fail };
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  const nights = nightsOnDisk(config.runsDir);
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    counts: Object.fromEntries(nights.map((n) => [n, nightCounts(config.runsDir, n)])),
  };
}
