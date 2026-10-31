# Moki for VS Code (IDE Companion)

Gives VS Code's AI the knowledge of your [Moki](https://github.com/Orsi88/moki) QA project (context, notes, context shared by tags, agents and skills) through a read-only MCP server, with a panel where you choose what the AI may use. Moki does not replace the AI of the IDE: it gives it what it needs to work on the project. The Moki desktop app does not have to be open.

## Use it

1. Open the folder of your system in VS Code. If the folder (or one above it) is linked to a Moki project ("Choose my folder" in the desktop app), the status bar shows **Moki: <project>**. Otherwise click it, or the Moki icon in the activity bar, and choose a project.
2. In Copilot Chat's agent mode, the **Moki** MCP server is listed with its tools. Ask for a task; the AI calls `moki_get_context` and reads only what it needs.
3. In the **Moki** panel:
   - **Project resources**: everything the project offers, by kind. Tick a resource to give it to the AI first (`moki_get_context` returns its text before anything else).
   - **How the AI may use it** (shield icon): **Automatic** (the AI may find and read it), **Ask first** (listed, read only after you tick it; the default for another project's context shared by tags), **Manual only** (hidden from the AI until you tick it).
   - Right-click: **Open in Editor**, **Copy Reference** (an id the AI can read with `moki_get_resource`), **Copy Content** (to paste into any chat).
   - **Show What the AI Read** (history icon): every tool call, in `workspace/projects/<id>/logs/companion.log`.

Choices are saved per project in `workspace/projects/<id>/companion.json`, so another project never sees them. A project chosen by hand is remembered for that VS Code workspace.

The extension keeps the framework in `<Documents>/Moki`, the same folder as the Moki desktop app, so both show the same workspaces and projects. `QA_ROOT` chooses another folder. Updating the extension refreshes the framework files there; it never touches `workspace/` or `workspaces/`.

## MCP tools (all read-only)

| Tool | What it returns |
|---|---|
| `moki_get_project` | The project: name, description, deliverable language, tags, agents and skills |
| `moki_list_resources` | References (id, title, description, mode), without content |
| `moki_search_knowledge` | Matching lines in the files the AI may read |
| `moki_get_resource` | The text of one resource |
| `moki_get_context` | The context pack for a task: selected resources with text (within a budget), then references to the most related ones |
| `moki_get_agent` | An agent's instructions; reading them does not run the agent |

The server is bound to one project when it starts and no tool can change it. Files of other projects are reachable only through a shared tag, and secret-looking files (`.env*`, keys, certificates, `credentials*`) are never listed or read.

The MCP servers the project has on in Moki (Settings › MCP servers, `docs/mcp-servers.md`) are registered too, with their `${VARIABLE}` values read from VS Code's environment; one whose variable is not set is left out, and the **MCP servers** group of the panel says why. **Moki: Sync MCP Servers to Cursor** writes them (and Moki's server) to `<linked folder>/.cursor/mcp.json` after you confirm, for Cursor opened on the system's folder.

Other AI tools can use the same server: `npm run mcp -- --project <id>` from the repository (or `--folder <path>` to find the project linked to a folder), for example in a Claude Code `.mcp.json` or a Cursor `mcp.json`.

## Build it from the source

From the repository root, with Node.js 22.18 or newer:

```bash
npm install
npm run vscode:build     # the extension and the MCP server in ide/vscode/dist, the framework copy
npm run vscode:package   # release/moki-<version>.vsix
```

Try it without installing: `code --extensionDevelopmentPath="$PWD/ide/vscode"` opens an Extension Development Host that uses the repository as the Moki folder (build first: the MCP server runs from `dist/mcp.cjs`). Install the package with `code --install-extension release/moki-<version>.vsix`. VS Code 1.101 or newer.

Keep `version` in `ide/vscode/package.json` equal to the root `package.json`; the build stops when they differ. How it fits the rest of Moki: `skills/moki-architecture/references/architecture.md` (layer 7b).
