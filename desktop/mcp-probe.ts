// Tests one MCP server for the MCP Manager: starts it (stdio, no shell) or calls it
// (http), asks initialize and tools/list, and stops it. Runs only when the person
// presses Test. The result never holds credentials: the variables were resolved
// only for the child process or the request, and error text is cut to a line.

import { spawn } from 'node:child_process';
import { which } from '../scripts/lib/core.ts';
import { McpError, resolveServer, type McpServer } from '../scripts/lib/mcp.ts';

export interface McpTool { name: string; description: string }
export interface ProbeResult { at: string; ok: boolean; tools: McpTool[]; server?: string; error?: string; ms: number }

const TIMEOUT = 15_000;
const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'moki', version: '1' } };

const toolsOf = (result: unknown): McpTool[] => {
  const list = (result as { tools?: unknown } | undefined)?.tools;
  return Array.isArray(list) ? list.map((t) => ({ name: String((t as McpTool).name ?? ''), description: String((t as McpTool).description ?? '').slice(0, 300) })).filter((t) => t.name) : [];
};
// Values that must never come back in a message: the resolved variables.
const redact = (text: string, secrets: string[]): string => secrets.filter((s) => s.length >= 4).reduce((t, s) => t.split(s).join('***'), text).split('\n')[0].slice(0, 300);

export async function probeServer(server: McpServer, env: NodeJS.ProcessEnv = process.env): Promise<ProbeResult> {
  const started = Date.now();
  const at = new Date().toISOString();
  let resolved: McpServer;
  try { resolved = resolveServer(server, env); } catch (e) {
    return { at, ok: false, tools: [], error: e instanceof McpError ? e.message : String(e), ms: 0 };
  }
  const secrets = [...Object.values(resolved.env), ...Object.values(resolved.headers)];
  try {
    const r = resolved.transport === 'http' ? await probeHttp(resolved) : await probeStdio(resolved, env);
    return { at, ok: true, ...r, ms: Date.now() - started };
  } catch (e) {
    return { at, ok: false, tools: [], error: redact(e instanceof Error ? e.message : String(e), secrets), ms: Date.now() - started };
  }
}

function probeStdio(s: McpServer, env: NodeJS.ProcessEnv): Promise<{ tools: McpTool[]; server?: string }> {
  return new Promise((resolvePromise, reject) => {
    const program = which(s.command) ?? s.command;
    // Windows: npx and other .cmd programs only start through cmd.exe; arguments stay an array.
    const viaCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(program);
    // cmd.exe would read these characters as commands, so such an argument is refused instead.
    if (viaCmd && [program, ...s.args].some((a) => /[&|<>^"%\r\n]/.test(a))) {
      reject(new Error(`${s.command} is a Windows .cmd program: its arguments cannot contain & | < > ^ " or %.`));
      return;
    }
    const child = viaCmd
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', program, ...s.args], { env: { ...env, ...s.env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
      : spawn(program, s.args, { env: { ...env, ...s.env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let buffer = '';
    let stderr = '';
    let serverName: string | undefined;
    let done = false;
    const finish = (err: Error | null, value?: { tools: McpTool[]; server?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      if (err) reject(err); else resolvePromise(value!);
    };
    const timer = setTimeout(() => finish(new Error(`No answer in ${TIMEOUT / 1000} s.${stderr ? ` ${stderr.trim()}` : ''}`)), TIMEOUT);
    const send = (msg: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
    child.on('error', (e) => finish(new Error(/ENOENT/.test(String(e)) ? `The command "${s.command}" was not found on this computer.` : String(e))));
    child.on('exit', (code) => finish(new Error(`The server stopped (exit code ${code}).${stderr ? ` ${stderr.trim()}` : ''}`)));
    child.stderr.on('data', (d: Buffer) => { stderr = (stderr + d.toString()).slice(-2000); });
    child.stdout.on('data', (d: Buffer) => {
      buffer += d.toString();
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg: { id?: number; result?: unknown; error?: { message?: string } };
        try { msg = JSON.parse(line); } catch { continue; } // servers may log on stdout
        if (msg.error && (msg.id === 1 || msg.id === 2)) { finish(new Error(msg.error.message ?? 'The server refused the request.')); return; }
        if (msg.id === 1) {
          serverName = String((msg.result as { serverInfo?: { name?: string } })?.serverInfo?.name ?? '') || undefined;
          send({ method: 'notifications/initialized' });
          send({ id: 2, method: 'tools/list', params: {} });
        } else if (msg.id === 2) finish(null, { tools: toolsOf(msg.result), server: serverName });
      }
    });
    send({ id: 1, method: 'initialize', params: INIT });
  });
}

// Streamable HTTP: JSON or a server-sent event stream as the answer; the session id goes back on the next request.
async function probeHttp(s: McpServer): Promise<{ tools: McpTool[]; server?: string }> {
  let session = '';
  const call = async (body: object): Promise<{ result?: unknown; error?: { message?: string } } | null> => {
    const res = await fetch(s.url, {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}), ...s.headers },
      body: JSON.stringify({ jsonrpc: '2.0', ...body }),
    });
    if (res.status === 401 || res.status === 403) throw new Error(`The server refused the credentials (HTTP ${res.status}).`);
    if (!res.ok && res.status !== 202) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    session = res.headers.get('mcp-session-id') ?? session;
    const text = await res.text();
    if (!text.trim()) return null;
    const json = (res.headers.get('content-type') ?? '').includes('text/event-stream')
      ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean).pop() ?? '{}'
      : text;
    return JSON.parse(json);
  };
  const init = await call({ id: 1, method: 'initialize', params: INIT });
  if (init?.error) throw new Error(init.error.message ?? 'The server refused to start a session.');
  await call({ method: 'notifications/initialized' });
  const list = await call({ id: 2, method: 'tools/list', params: {} });
  if (list?.error) throw new Error(list.error.message ?? 'The server did not list its tools.');
  return { tools: toolsOf(list?.result), server: String((init?.result as { serverInfo?: { name?: string } })?.serverInfo?.name ?? '') || undefined };
}
