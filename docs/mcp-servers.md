# MCP servers (MCP Manager)

Moki keeps the MCP servers your agents, operations and the IDE use in one place, in two scopes:

| Scope | Where it is managed | File |
|---|---|---|
| Workspace | Settings › MCP servers › Workspace | `workspace/mcp-servers.json` |
| Project | Settings › MCP servers › *project name* | `workspace/projects/<id>/mcp-servers.json`, choices in `project.json` `mcp` |

Settings › Workspace is where shared servers are added, edited, tested, imported and deleted. A project turns each workspace server on or off and can add servers only it has; it never edits a workspace server. To use another configuration in one project, add a project server.

## Rules

| Situation | What happens |
|---|---|
| Add a workspace server | Offered to every project of the workspace |
| New project | Gets the catalog with each server's default (servers that **execute** start off) |
| Turn an inherited server off | Only in that project |
| Change a workspace server | Every project that has it on uses the new definition |
| Delete a workspace server | It leaves every project; their choices about it are removed |
| Add or delete a project server | Only that project |
| Switch workspace | The other workspace's catalog |
| An operation is running | Its steps keep the servers they had when it started |

- **Ids** are made from the name, never change on rename and are unique in the whole workspace (a project server whose name matches a workspace one gets `-project`). Agents name servers by id in their `mcps` contract (`docs/agents.md`).
- **Access:** `read` queries data; `execute` changes something outside Moki, so an operation step that uses it waits for your approval and new projects start with it off.
- **An agent gets only what its contract names and the project has on.** Turning a server on in the workspace never gives any agent or project unrestricted access.

## Credentials

Moki never stores credential values. In Environment and Headers, write `${VARIABLE}` (for example `Authorization=Bearer ${GITHUB_TOKEN}`) and set the variable on the computer. Values that look like a token, password or key, written as is, are refused; an imported configuration that has them gets `${VARIABLE}` names instead, which Moki lists so you can set them. The variables are read only when a server starts or is tested, and are never written to Moki's files or logs.

## Testing

**Test** starts the server once (stdio, without a shell) or calls it (HTTP), asks for its tools and stops it. The result is kept in `workspace/mcp-status.json` and every action in `workspace/logs/mcp.log`, without values. A failure says why: command not found, a variable not set, credentials refused, no answer in 15 seconds.

## Where the servers reach the AI tools

| Tool | How |
|---|---|
| Claude Code started from Moki | `--mcp-config` with the project's servers that are on and Moki's own server for the project (your own Claude Code servers still load) |
| Cursor and Cursor Agent started from Moki | The `moki` and `moki-*` entries of `<Moki folder>/.cursor/mcp.json`; your entries stay. It holds the last project started in Cursor |
| Cursor opened on the system's folder | **Sync with Cursor** (project tab, or `Moki: Sync MCP Servers to Cursor` in VS Code) writes the same entries to `<linked folder>/.cursor/mcp.json` after you confirm; `writeAllowed: false` refuses it and the current file is backed up to `.moki-backup/` first |
| VS Code with the Moki extension | Moki's server and the project's servers that are on, registered automatically; a server whose variable is not set is left out and shown with the reason |
| Other tools (Codex, Gemini, Antigravity) | **Copy for Claude Code / Copy for Cursor** gives the configuration to paste; Moki warns when a step's agent needs a server its AI does not have |

Moki's own server (`ide/mcp/server.ts`) is read-only and bound to one project: the AI reads the project's context, notes, shared context, agents and skills through it (`ide/vscode/README.md`).

**Found in the AI tools** lists the servers already configured in the tools' own files (`.mcp.json`, `~/.claude.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`); **Import into Moki** brings one into the catalog.
