// The Chromium switches Moki starts with, decided before the app is ready: DEFAULT_SWITCHES (what the app always
// uses, empty; a non-GPU switch could be added only after a measurement on a real machine) plus the user's QA_ELECTRON_ARGS. Both go
// through the same allow-list as QA_ELECTRON_ARGS alone (electron-args.ts): a default that is not allowed is
// rejected and reported, never applied. Pure, so it is tested without Electron.

import { parseElectronArgs, type ElectronSwitch } from './electron-args.ts';

// Tokens in the format of QA_ELECTRON_ARGS. Product decision: the GPU stays on whenever there is one, so no default may
// turn it off (--disable-gpu, --disable-software-rasterizer, --in-process-gpu); those switches exist only so a measurement
// can ask for them with an explicit QA_ELECTRON_ARGS.
export const DEFAULT_SWITCHES: readonly string[] = [];

export interface ResolvedSwitches {
  accepted: ElectronSwitch[]; // every allowed token, defaults first then the user's, as written
  rejected: string[]; // tokens that are not allowed (defaults and the user's)
  defaultsOff: boolean; // the defaults were not used (A/B)
  applied: ElectronSwitch[]; // what to give appendSwitch: one entry per name, the user's value over the default's
}

// Defaults are off with QA_NO_DEFAULT_SWITCHES=1, or when QA_ELECTRON_ARGS exists but is empty or blank (a clean A/B run).
// QA_ELECTRON_ARGS unset keeps the defaults on.
export function resolveSwitches(env: Record<string, string | undefined>, defaults: readonly string[] = DEFAULT_SWITCHES): ResolvedSwitches {
  const defaultsOff = env.QA_NO_DEFAULT_SWITCHES === '1' || (env.QA_ELECTRON_ARGS !== undefined && env.QA_ELECTRON_ARGS.trim() === '');
  const base = parseElectronArgs(defaults.join(' '));
  const user = parseElectronArgs(env.QA_ELECTRON_ARGS);
  const accepted = [...(defaultsOff ? [] : base.accepted), ...user.accepted];
  // A Map keeps the first position of a name and the last value (insertion order, later set wins).
  const applied = [...new Map(accepted.map((s) => [s.switch, s])).values()];
  return { accepted, rejected: [...(defaultsOff ? [] : base.rejected), ...user.rejected], defaultsOff, applied };
}

// The line logged to stderr when QA_PERF=1, so a measurement records what it ran with.
export function describeSwitches(r: ResolvedSwitches): string {
  const list = r.applied.map((s) => (s.value === undefined ? `--${s.switch}` : `--${s.switch}=${s.value}`)).join(' ');
  return `QA_PERF switches: ${list || '(none)'} (defaults: ${r.defaultsOff ? 'off' : 'on'})`;
}
