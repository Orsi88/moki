# MCP servers (MCP Manager)

Moki keeps the MCP servers your agents, operations and the IDE use in one list per workspace (`workspace/mcp-servers.json`), managed in **Settings › MCP servers**. Each server says where it applies:

| Where it applies | Who gets it |
|---|---|
| **Global** | Every project of the workspace |
| **Specific projects** | Only the projects chosen for it |

Where a server applies is set in its row of the list: the **Global** switch, or, with it off, the folder button beside it, which opens the list of projects to tick; the projects chosen show as small chips under the row (the × of a chip takes that project out). Turning Global off changes nothing until a first project is chosen, and a server for specific projects keeps at least one (to give it to every project, turn Global on). The same choice is in the server's form.

A server can also be switched **off**: it stays in the list and no project gets it.

## Rules

| Situation | What happens |
|---|---|
| Add a global server | Every project of the workspace gets it, new projects included |
| Add a server for specific projects | Only those projects get it |
| Change a server | Every project it applies to uses the new definition |
| Switch a server off, or delete it | No project gets it any more |
| A project is deleted | It is left out of the servers that listed it |
| Switch workspace | The other workspace's list |
| An operation is running | Its steps keep the servers they had when it started |

- **Ids** are made from the name, never change on rename and are unique in the list (a second server with the same name gets `-2`). Agents name servers by id in their `mcps` contract (`docs/agents.md`).
- **Access:** `read` queries data; `execute` changes something outside Moki, so an operation step that uses it waits for your approval.
- **An agent gets only what its contract names and its project has.** A global server never gives any agent unrestricted access.

## Credentials

Moki never stores credential values. In Environment and Headers, write `${VARIABLE}` (for example `Authorization=Bearer ${GITHUB_TOKEN}`) and set the variable on the computer. Values that look like a token, password or key, written as is, are refused; an imported configuration that has them gets `${VARIABLE}` names instead, which Moki lists so you can set them. The variables are read only when a server starts or is tested, and are never written to Moki's files or logs.

## Testing

**Test** starts the server once (stdio, without a shell) or calls it (HTTP), asks for its tools and stops it. The result is kept in `workspace/mcp-status.json` and every action in `workspace/logs/mcp.log`, without values. A failure says why: command not found, a variable not set, credentials refused, no answer in 15 seconds.

## Where the servers reach the AI tools

| Tool | How |
|---|---|
| Claude Code started from Moki | `--mcp-config` with the project's servers that are on and Moki's own server for the project (your own Claude Code servers still load) |
| Cursor and Cursor Agent started from Moki | The `moki` and `moki-*` entries of `<Moki folder>/.cursor/mcp.json`; your entries stay. It holds the last project started in Cursor |
| Cursor opened on the system's folder | `Moki: Sync MCP Servers to Cursor` in VS Code writes the same entries to `<linked folder>/.cursor/mcp.json` after you confirm; `writeAllowed: false` refuses it and the current file is backed up to `.moki-backup/` first |
| VS Code with the Moki extension | Copilot Chat: Moki's server and the project's servers that are on, registered automatically (a server whose variable is not set is left out). Claude Code in VS Code: **Connect Claude Code** in the Moki panel writes the same entries to the folder's `.mcp.json` after you confirm. **Open in Claude Code** in the panel starts it with `--mcp-config` |
| Other tools (Codex, Gemini, Antigravity) | Not configured by Moki; Moki warns when a step's agent needs a server its AI does not have |

Moki's own server (`ide/mcp/server.ts`) is read-only and bound to one project: the AI reads the project's context, notes, shared context, agents and skills through it (`ide/vscode/README.md`).

**Found in the AI tools** lists the servers already configured in the tools' own files (`.mcp.json`, `~/.claude.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`); **Import into Moki** brings one into the catalog.
