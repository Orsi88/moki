# Moki for VS Code (Moki light)

A light version of [Moki](https://github.com/Orsi88/moki) in the side bar of VS Code, with the app's look: start QA activities, use your project's agents, choose what goes to the AI and follow the open runs, with Claude Code or the chat of VS Code. Moki does not replace the AI of the IDE: it gives it the project's context, agents, skills and MCP servers. The Moki desktop app does not have to be open.

## Use it

1. Open the folder of your system. If it (or a folder above it) is linked to a Moki project ("Choose my folder" in the app), the panel and the status bar show **Moki: <project>**; otherwise choose the project at the top of the panel.
2. Click the Moki icon in the activity bar. The panel has four tabs:

| Tab | What you do |
|---|---|
| **Activities** | Pick one (Design tests, Review user stories, Failure pre-analysis…), choose inbox files, an agent, a note and the language |
| **Agents** | The agents this project uses, with what they do; pick one to work with it |
| **Context** | Switch each context file, note or shared file on or off for the AI; the star gives it to the AI first |
| **Runs** | Activities to resume; multi-agent operations to start and follow step by step (see below) |

3. Then:
   - **Open in Claude Code** opens Claude Code in a VS Code terminal with the request ready and the project's MCP servers (`--mcp-config`), like the app does.
   - **Copy for the chat** copies the same request and puts the cursor in the Claude Code chat (or opens Copilot Chat with it): paste and send.

A file switched off stays out of the requests and of what the AI can read through Moki's MCP server. Choices are saved per project in `workspace/projects/<id>/companion.json`.

## Operations

A multi-agent operation linked to the project (the project's Operations panel in the app) runs from **Runs › Start an operation**: choose the AI of each step, fill what the agents need (text and inbox files) and what you want, then **Start the operation**. Each step opens in its own VS Code terminal (**Moki · <AI>**). The extension moves the run on by itself whenever the project's files change, even with the panel closed: a step is done when it writes its summary (`handoff/<slot>.md`) and its outputs, and the next one starts. Open the run to:

- **answer** a step's question (typed into its terminal when it is open, otherwise the step reopens with your answer);
- **approve**, **send back with notes** or **end** a step that waits for approval (approval arrows, and steps that execute through an MCP);
- **try again** a step whose terminal closed before its summary, with the same or another AI;
- **choose the path** when no arrow fits a result, or a step would run too many times;
- **pause**, **cancel** (its terminal is closed) and **show its terminal**.

Operations are the same as in the app (same engine and run folder, `workspace/projects/<id>/runs/`), so a run started here can be followed there and the other way round. Editing operations and linking them to a project stay in the app.

## MCP servers

- **Claude Code in the IDE** reads its servers from the folder's `.mcp.json`. **Connect Claude Code** (panel footer, or `Moki: Connect Claude Code`) writes Moki's server and the project's servers that are on there after you confirm; your own entries stay, the current file is backed up to `.moki-backup/` first, and a new `.mcp.json` is kept out of Git (`.git/info/exclude`).
- **Copilot Chat** gets them automatically (`MCP: List Servers` shows **Moki**); a server whose `${VARIABLE}` is not set is left out.
- **Cursor** on the linked folder: `Moki: Sync MCP Servers to Cursor`.

The servers themselves are managed in the app (Settings › MCP servers, `docs/mcp-servers.md`).

Moki's own server is read-only and bound to one project when it starts:

| Tool | What it returns |
|---|---|
| `moki_get_project` | The project: name, description, deliverable language, tags, agents, skills and MCP servers |
| `moki_list_resources` | References (id, title, description, mode), without content |
| `moki_search_knowledge` | Matching lines in the files the AI may read |
| `moki_get_resource` | The text of one resource |
| `moki_get_context` | The context pack for a task: the starred files with text (within a budget), then references to the most related ones |
| `moki_get_agent` | An agent's instructions; reading them does not run the agent |

Files of other projects are reachable only through a shared tag, and secret-looking files (`.env*`, keys, certificates, `credentials*`) are never listed or read. `Moki: Show What the AI Read` opens `workspace/projects/<id>/logs/companion.log`. Other AI tools can use the server too: `npm run mcp -- --project <id>` from the repository.

## Security

The panel is a small page (`app/companion.html`) in a webview with its own Content-Security-Policy: scripts only with the page's nonce, styles and images only from the extension, no network. It talks only to `desktop/companion-api.ts`, a closed list of calls that always use the project VS Code is connected to (a project sent by the page is ignored) and go through the same service as the desktop app. AI tools start as a command plus arguments, never through a shell.

## Build it from the source

From the repository root, with Node.js 22.18 or newer:

```bash
npm install
npm run vscode:build     # the extension, the panel, the MCP server and the framework copy in ide/vscode/dist
npm run vscode:package   # release/moki-<version>.vsix
```

Try it without installing: `code --extensionDevelopmentPath="$PWD/ide/vscode"` (build first). Install the package with `code --install-extension release/moki-<version>.vsix`. VS Code 1.101 or newer.

The extension keeps the framework in `<Documents>/Moki`, the same folder as the desktop app, so both show the same workspaces and projects (`QA_ROOT` chooses another folder). Keep `version` in `ide/vscode/package.json` equal to the root `package.json`; the build stops when they differ. How it fits the rest of Moki: `skills/moki-architecture/references/architecture.md` (layer 7b).
