// Entry of the parse worker (a worker_threads Worker, bundled on its own as parse-worker.mjs).
// It answers { id, kind, data } with { id, result } or { id, error }; one file at a time.

import { parentPort } from 'node:worker_threads';
import { parseOffice, type OfficeKind } from './parse-office.ts';

parentPort?.on('message', (m: { id: number; kind: OfficeKind; data: Uint8Array }) => {
  try {
    if (!(m.data instanceof Uint8Array)) throw new Error('Invalid request.');
    parentPort?.postMessage({ id: m.id, result: parseOffice(m.kind, m.data) });
  } catch (e) {
    parentPort?.postMessage({ id: m.id, error: e instanceof Error ? e.message : String(e) });
  }
});
