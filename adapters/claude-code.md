# Claude Code

## Setup

1. Clone the repository and open its folder: `cd moki && claude` (or open the folder in the VS Code / JetBrains extension or the desktop app).
2. Optional but recommended: `npm run setup` (pre-commit protection and workspace folders).

What loads automatically:
- `CLAUDE.md`, which imports `AGENTS.md` with `@AGENTS.md`. (Recent Claude Code versions also read `AGENTS.md` directly when no `CLAUDE.md` exists; the import makes it work in every version.)
- All skills in `.claude/skills/` — listed by name and description; the full `SKILL.md` loads only when used.

## Working with a target system's repository

Keep this repository as the working folder and add the target repository as an extra directory, e.g. `claude --add-dir ../my-system`, or `/add-dir ../my-system` inside a session. Results still go to `workspace/projects/<project-id>/`.

## Moki MCP server

In a system's repository linked to a Moki project, Claude Code can read the project's context, agents and skills through the read-only Moki MCP server. Add it to the repository's `.mcp.json`:

```json
{ "mcpServers": { "moki": { "command": "node", "args": ["<moki folder>/ide/mcp/server.ts", "--project", "<project-id>"] } } }
```

See `ide/vscode/README.md` for the tools.

## Running

- Natural language: "Review the user story in workspace/projects/acme-library/inbox/us-101.md".
- Direct invocation: `/requirements-review`, `/test-design`, `/failure-analysis`, `/qa-orchestrator`, `/project-context`.

## Limitations

- Image reading works for screenshots added to the conversation or read from files.
- Generating xlsx/PDF uses the repository scripts (`npm run xlsx`, `npm run pdf`) — Node.js ≥ 20 is required; PDF needs Edge or Chrome installed.
- If you create a personal `CLAUDE.local.md`, keep the `@AGENTS.md` import in `CLAUDE.md` (already there) so instructions still load.
