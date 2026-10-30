// Plan morning-digest § 1. Types only: every part of section 2 starts against these.
export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number; // valid lines for this job
  retries: number; // lines with status retry
  fails: number; // lines with status fail
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string; // as written in the log, offset kept
  lastAt: string;
};

export type DigestNight = { night: string; rows: DigestRow[]; badLines: number };

// null: the night has no file, or its name is not YYYY-MM-DD.
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
