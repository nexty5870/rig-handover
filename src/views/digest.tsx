import type { DigestNight, DigestRow } from '../digest/types.js';

const dash = '—';

function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.fails >= 1) out.push('failed');
  if (row.retries >= 3) out.push('3+ retries');
  return out;
}

export function DigestPage({ digest }: { digest: DigestNight }) {
  return (
    <>
      <h1>digest {digest.night}</h1>
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
              <th>mark</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const m = marks(row);
              return (
                <tr class={m.length > 0 ? 'warn' : undefined}>
                  <td>{row.job || dash}</td>
                  <td>{row.owner ?? dash}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? dash}</td>
                  <td>{row.firstAt || dash}</td>
                  <td>{row.lastAt || dash}</td>
                  <td>{m.length > 0 ? m.join(' · ') : dash}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p class="mute">bad lines: {digest.badLines}</p>
    </>
  );
}

export function DigestMissing({ night }: { night: string }) {
  return (
    <>
      <h1>digest {night}</h1>
      <p class="warn">no such night</p>
    </>
  );
}
