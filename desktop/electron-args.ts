// QA_ELECTRON_ARGS: Chromium switches for measuring (for example --disable-gpu), read by main.ts before the app is ready.
// Applied together with the built-in defaults (chromium-switches.ts). It is an environment variable, so it is filtered anyway: only a short allow-list of
// switches, a safe value alphabet and a size limit; anything else (--no-sandbox, --remote-debugging-*, --user-data-dir…)
// is dropped and reported, never applied.

export interface ElectronSwitch { switch: string; value?: string } // switch without the leading "--", as appendSwitch wants it
export interface ParsedElectronArgs { accepted: ElectronSwitch[]; rejected: string[] }

// true = the switch needs a value (--name=value); false = it takes none.
const ALLOWED: Record<string, boolean> = {
  'disable-gpu': false,
  'in-process-gpu': false,
  'disable-software-rasterizer': false,
  'enable-features': true,
  'disable-features': true,
  'js-flags': true,
};
const SAFE_VALUE = /^[A-Za-z0-9_.,:=+-]+$/; // no spaces (the list is split on them), quotes, ; | & $ or slashes
const MAX_TOKEN = 200;
const MAX_TOKENS = 20;

export function parseElectronArgs(raw: string | undefined): ParsedElectronArgs {
  const accepted: ElectronSwitch[] = [];
  const rejected: string[] = [];
  const tokens = (raw ?? '').split(/\s+/).filter(Boolean);
  tokens.forEach((token, i) => {
    if (i >= MAX_TOKENS || token.length > MAX_TOKEN || !token.startsWith('--')) { rejected.push(token.slice(0, 60)); return; }
    const eq = token.indexOf('=');
    const name = token.slice(2, eq < 0 ? undefined : eq);
    const value = eq < 0 ? undefined : token.slice(eq + 1);
    const ok = Object.hasOwn(ALLOWED, name) && (ALLOWED[name] ? value !== undefined && SAFE_VALUE.test(value) : value === undefined);
    if (ok) accepted.push(value === undefined ? { switch: name } : { switch: name, value });
    else rejected.push(token.slice(0, 60));
  });
  return { accepted, rejected };
}
