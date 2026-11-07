// Linux only: the memory of a process as PSS (proportional set size) from /proc/<pid>/smaps_rollup. RSS counts
// the libraries and Chromium pages that several processes share once in each of them; PSS splits a shared page
// between the processes that use it, so the sum over Moki's processes is the memory they really take.
// Reads are asynchronous (the main process must not block) and fall back, per pid, to the RSS already known.

import { readFile } from 'node:fs/promises';

// "Pss:  1234 kB" in the text of smaps_rollup; null when the line is missing (old kernel, other format).
export function parsePssKb(text: string): number | null {
  const m = /^Pss:\s+(\d+)\s*kB/m.exec(text);
  return m ? Number(m[1]) : null;
}

export type ReadSmaps = (pid: number) => Promise<string>;
const readSmaps: ReadSmaps = (pid) => readFile(`/proc/${pid}/smaps_rollup`, 'utf8');

// kB per pid, read in parallel: its PSS, or the given RSS (kb) when its smaps_rollup cannot be read
// (missing file, a process of another user, a process that already exited).
export async function memoryKbByPid(procs: { pid: number; kb: number }[], read: ReadSmaps = readSmaps): Promise<Map<number, number>> {
  const kbs = await Promise.all(procs.map(async ({ pid, kb }): Promise<[number, number]> => {
    try { return [pid, parsePssKb(await read(pid)) ?? kb]; } catch { return [pid, kb]; }
  }));
  return new Map(kbs);
}
