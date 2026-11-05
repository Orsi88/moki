# Moki in the IDE (VS Code)

The Moki extension for VS Code (*Moki light*) brings a project's knowledge and tools to the AI you already use in the editor. It does not replace that AI and it does not need the desktop app to be open: it gives Claude Code or Copilot Chat the project's context, agents, skills and MCP servers, and lets you start activities and multi-agent operations from a side panel.

This guide covers installing it, configuring it, every way to use it, and what to do when something does not work. The short reference for the extension itself is [ide/vscode/README.md](../ide/vscode/README.md); MCP servers are managed as described in [mcp-servers.md](mcp-servers.md).

## What you get

Three separate pieces arrive in the IDE. Knowing which is which explains most of what follows.

| Piece | What it is | What it is for |
|---|---|---|
| **The Moki panel** | A side bar with the app's look: Activities, Agents, Context, Runs | Start an activity or an operation, choose what the AI reads, follow runs |
| **Moki's MCP server** | A read-only server bound to one project ([ide/mcp/server.ts](../ide/mcp/server.ts)) | The IDE's AI reads the project's confirmed context, notes, shared context, agents and skills while you work |
| **The project's MCP servers** | The servers registered in the app's MCP Manager (Playwright, Azure DevOps, Jira…) that apply to the project and are on | The IDE's AI uses the same external tools as the app and the operations, configured once |

```text
Moki app ── Settings › MCP servers ──┐
                                     ├──> IDE's AI (Claude Code, Copilot Chat)
Moki project (context, notes, agents)┘        ▲
          └── Moki's MCP server (read-only) ──┘
```

Registering a tool in Moki instead of directly in the IDE means the agents, the operations and the IDE all get it, with credentials kept as `${VARIABLE}`. A server added only to the IDE works only there, and the IDE's AI still knows nothing about the project.

## Requirements

- VS Code 1.101 or newer.
- At least one Moki project in the active workspace. Projects are created in the desktop app.
- For **Open in Claude Code** and for operations: an AI tool that runs in a terminal (Claude Code, Codex, Gemini CLI, Antigravity CLI or Cursor Agent) installed on the computer.
- To build the extension yourself: Node.js 22.18 or newer.

## Install

**From the desktop app.** **Settings › My AIs › Install the Moki extension and open** on the VS Code card installs the extension of the app's version (downloaded from its release and checked by SHA-256) and opens VS Code on the project's linked folder. The Cursor card does the same, marked *Not verified*.

**From the release.** Download [moki-0.3.0.vsix](https://github.com/Orsi88/moki/releases/download/v0.3.0/moki-0.3.0.vsix) from the [latest release](https://github.com/Orsi88/moki/releases/latest), then:

```bash
code --install-extension moki-0.3.0.vsix --force
```

**From the source.** From the repository root:

```bash
npm install
npm run vscode:package                                   # release/moki-<version>.vsix
code --install-extension release/moki-<version>.vsix --force
```

Then run **Developer: Reload Window** in VS Code. Reinstall the same way after each new build; a window that is not reloaded keeps the old version.

**Without installing (development).** `npm run vscode:build`, then `code --extensionDevelopmentPath="$PWD/ide/vscode"`. In this mode the extension uses the repository itself instead of `<Documents>/Moki`.

**What happens on the first start.** The installed extension keeps its copy of the framework in `<Documents>/Moki`, the same folder as the desktop app, so both see the same workspaces and projects (`QA_ROOT` chooses another folder). It opens the workspace that was **active in the app** when VS Code started. A Moki icon (the cat) appears in the activity bar and **Moki: …** in the status bar.

## Configure

### 1. Connect the folder to a project

The extension finds the project of the folder open in VS Code:

| Situation | What it does |
|---|---|
| You chose a project for this VS Code workspace before | Uses it while it exists |
| The folder (or a folder above it) is linked to exactly one project | Uses that project |
| It is linked to more than one | Status bar: **Moki: choose a project** |
| It is linked to none | Status bar: **Moki: no project** |

To link a folder for good, open the project in the desktop app and use the **link** button of the ribbon (the chain): every VS Code window on that folder then opens the project by itself. To pick a project for this VS Code workspace only, click the status bar item, the project selector at the top of the panel, or run **Moki: Choose Project**. A folder linked from the app is listed first, as *Linked to this folder*.

### 2. Connect the AI to Moki's MCP servers

| How you use the AI | What to do |
|---|---|
| **Copilot Chat** | Nothing. The extension registers **Moki** and the project's servers by itself (`MCP: List Servers` shows them) |
| **Claude Code opened from the panel** (*Open in Claude Code*) | Nothing. It starts with `--mcp-config` for the project, as in the app |
| **Claude Code opened by you** (the Claude Code chat, or `claude` typed in a terminal) | **Connect Claude Code** once per folder (panel footer, or **Moki: Connect Claude Code**) |
| **Cursor** opened on the project's linked folder | **Moki: Sync MCP Servers to Cursor** |
| **Only the panel** | Nothing. The panel works without MCP |

**Connect Claude Code** writes Moki's server and the project's servers that are on to the folder's `.mcp.json` after you confirm. Only Moki's entries (`moki`, `moki-*`) change and yours stay; the current file is backed up to `.moki-backup/` first; a new `.mcp.json` is kept out of Git (`.git/info/exclude`), and you are warned when the file is already versioned. It writes a **copy**: after turning servers on or off in the app, or switching project, connect again. Copilot follows those changes by itself.

### 3. Choose what the AI may read

In **Activities**, **Agents** and **Operations** the panel lists only the starred items (the same stars as in the app) and the 5 most used ones, counted when you start something from the panel. A search box finds the others. With no star or use yet, the first 5 show.

In **Context**, each context file, note and file shared by tags has a switch. Off, it stays out of the requests and out of what the AI can read through Moki's MCP server. The star makes it a priority: the AI gets it first, with its text, in the context pack. Files shared by tags with other projects wait for you (off) until you switch them on. The choices are kept per project in `workspace/projects/<id>/companion.json`.

## The panel

| Tab | What you do |
|---|---|
| **Activities** | Pick an activity, inbox files, an agent, a note and the language, then **Open in Claude Code** or **Copy for the chat** |
| **Agents** | The agents enabled in the project and what each one does; pick one to work with it |
| **Context** | Switch files on or off for the AI; star the ones it should read first |
| **Runs** | Activities to resume, and multi-agent operations to start and follow step by step |

The footer shows how many of the project's MCP servers are on (**MCPs: n on**), **Connect Claude Code** and **Refresh**. The view's title bar has *Choose Project* and *Refresh*; its "…" menu has *Connect Claude Code*, *Sync MCP Servers to Cursor* and *Show What the AI Read*.

## Ways to use it

### Ask the IDE's AI about the project

While you code or write tests, ask in plain language: *"which business rules apply to free shipping?"*, *"what does the checkout flow say about coupons?"*. With Moki's server connected (automatic in Copilot; **Connect Claude Code** for the Claude Code chat), the AI answers from the project's confirmed context instead of guessing. It can call:

| Tool | Returns |
|---|---|
| `moki_get_project` | Name, description, deliverable language, tags, agents, skills and MCP servers |
| `moki_get_context` | A context pack for a task: starred files with their text (within about 24,000 characters), then references to the most related files |
| `moki_search_knowledge` | Matching lines across the files it may read |
| `moki_list_resources` / `moki_get_resource` | References, and the text of one context file, note, shared file, agent or skill |
| `moki_get_agent` | An agent's instructions (reading them does not run the agent) |

### Start a QA activity

In **Activities**, choose one (*Review user stories*, *Design tests*, *Review, then design tests*, *Failure pre-analysis*, *Build test evidence*, *Project context*…), the inbox files it needs, optionally an agent and a note, and the language. Then:

- **Open in Claude Code** opens Claude Code in a VS Code terminal named **Moki · Claude Code**, with the request and the project's MCP servers. You continue the conversation there.
- **Copy for the chat** copies the same request and puts the cursor in the Claude Code chat, or opens Copilot Chat with it typed in: paste and send. Use it when you prefer the chat to a terminal.

The request is the one the desktop app builds: it names the project, the activity's skill, the files you chose and the files you switched off in Context. The skills stop at their approval points exactly as in the app.

### Work as one of the project's agents

In **Agents**, pick an agent and start from there, or choose it in an activity. In a chat already open, *"act as the test-designer agent of this project"* also works: the AI reads the agent's instructions through `moki_get_agent`.

### Resume an activity

**Runs › Activities to resume** lists runs that stopped at an approval point or waiting for input. Pick one to open the AI with the run, so it continues from its `state.json`.

### Run a multi-agent operation

An operation linked to the project in the app starts from **Runs**: pick it, choose the AI of each step, fill what the agents need (text and inbox files) and what you want, then **Start the operation**.

- Each step opens in its own VS Code terminal (**Moki · <AI>**). A step is done when it writes its summary (`handoff/<slot>.md`) and its outputs; the next one starts by itself, even with the panel closed.
- Open the run to **answer** a step's question (typed into its terminal when it is open, otherwise the step reopens with your answer), **approve**, **send back with notes** or **end** a step waiting for approval, **try again** a failed step with the same or another AI, **choose the path** when no arrow fits a result or a step would run too many times, **pause**, **cancel** (its terminal closes) and **show its terminal**.
- Runs are the same as in the app (same engine and run folder), so a run started in the IDE can be followed in the app and the other way round. Creating and editing operations, and linking them to a project, stay in the app.

### Automate tests with the project's context

Register the Playwright MCP server in the app (Settings › MCP servers) as global or for the project, then in the IDE ask the AI to automate a scenario: it reads the rules and flows through Moki's server and drives the browser through Playwright while it writes and checks the test. The same works for any tool registered in Moki: Azure DevOps or Jira to read a work item while investigating a failure, Figma to compare a screen with its design.

### Bring tools you already have in the IDE into Moki

Servers configured directly in Claude Code, Cursor or VS Code show in the app under **Settings › MCP servers › Found in the AI tools**. **Import into Moki** adds one to the catalog, so agents and operations can use it too; a credential written in it becomes a `${VARIABLE}`.

### See what the AI read

**Moki: Show What the AI Read** opens `workspace/projects/<id>/logs/companion.log`: each read through Moki's server, with the tool and what was asked.

### Other AI tools and editors

Any tool that speaks MCP over stdio can use Moki's server: `npm run mcp -- --project <id>` from the repository (or `--folder <path>` to find the project of a folder). Cursor opened on the project's linked folder gets the servers through **Moki: Sync MCP Servers to Cursor**.

## App or IDE: where each thing is

| Task | App | IDE |
|---|---|---|
| Create a project, link its folder, prepare its context | Yes | No |
| Register MCP servers and choose their projects | Yes | No (the IDE uses them) |
| Create and edit agents and operations; link operations to a project | Yes | No |
| Start activities and agents | Yes | Yes |
| Choose the context the AI reads | Yes (per activity) | Yes (per project, `companion.json`) |
| Start and follow operations | Yes | Yes |
| The AI reads the project while you code | No | Yes (Moki's MCP server) |

## Exceptions and troubleshooting

| What you see | Why | What to do |
|---|---|---|
| Status bar **Moki: no project**; panel *This folder is not linked to a Moki project* | The open folder is not linked to any project | Choose a project in the panel, or link the folder in the app (**Choose my folder**) |
| **Moki: choose a project** | The folder is linked to more than one project | Choose one; the choice is kept for this VS Code workspace |
| *There are no projects in the active workspace* | The workspace active in the app has no projects, or another workspace was active when VS Code started | Create a project in the app, or make the right workspace active in the app and **Reload Window** |
| The projects listed are from another workspace | The extension opens the workspace active in the app when VS Code started | Switch the workspace in the app, then **Reload Window** |
| *Choose the Moki project of this folder first.* | A command was run with no project chosen | Choose the project, then run it again |
| *Open a folder in the IDE first.* (Connect Claude Code) | VS Code has no folder open, so there is no place for `.mcp.json` | Open the system's folder |
| The Claude Code chat does not see Moki | `.mcp.json` was never written, or was written before the servers changed | **Connect Claude Code**, then start a new Claude Code session |
| Copilot does not list a server | Its `${VARIABLE}` is not set on this computer (it is left out), or it is off or not for this project in the app | Set the variable and restart VS Code; check the server in the app |
| **MCPs: 0 on** | No server registered in the app applies to this project and is on | Expected when you use only Moki's server; otherwise register or enable servers in the app |
| *This project has no linked folder on this computer* (Sync to Cursor) | The project's folder was never linked on this computer | Link it in the app (the **link** button of the ribbon) |
| *project.json does not allow writing to …* | The project sets `writeAllowed: false` for its folder | Write the file yourself, or allow writing in `project.json` |
| *… is not installed on this computer (command "…" not found).* | The AI tool chosen (for the request or for a step) is not installed or not on the PATH | Install it, or choose another AI (in the desktop app, **Settings › My AIs › Install**, or a terminal tab of the missing AI, installs it after you type `y`). A step that cannot start fails once and waits: **Try again** offers the installed AIs |
| *The terminal of this step is not open in VS Code.* | The step's terminal was closed, or VS Code was restarted | Answer the step in the panel (it reopens with your answer) or **Reopen the step** |
| A step shows **Failed** | Its terminal closed before it wrote its summary, or its AI could not open | **Try again**, with the same or another AI; what it delivered stays in its folder |
| *No AI tool that runs in a terminal is installed* | Operations need a terminal AI (Claude Code, Codex, Gemini CLI, Antigravity CLI, Cursor Agent) | Install one |
| *{agent} uses the MCP server {mcp}, which is not configured for {ai}* | The step's agent needs a server its chosen AI does not get | Choose another AI for that step, or make the server available |
| The panel looks like an older version after a rebuild | The installed package is older than the build, or the window was not reloaded | Reinstall the `.vsix` with `--force` and **Reload Window** |
| *This workspace has no operations yet* | No operation exists in the workspace | Create one in the app (Settings › Operations) and link it to the project |

## Security and privacy

- Moki's MCP server is **read-only** and bound to one project when it starts; no tool can change the project or reach another one. Files of other projects are reachable only through a shared tag, and only once you switch them on.
- Files that look secret (`.env*`, keys and certificates, `credentials*`, `secrets*`, SSH keys) are never listed or read.
- The panel runs in a webview with its own Content-Security-Policy (scripts only with the page's nonce, no network) and talks only to a closed list of calls that always use the project VS Code is connected to.
- AI tools start as a command plus arguments, never through a shell.
- MCP credentials are `${VARIABLE}` references read from this computer's environment; Moki never stores their values.
- The project's MCP servers do what they do: a server marked *executes* waits for your approval in operations, but inside the IDE's own chat the IDE's AI decides when to call it.

## Files the extension writes

| File | When |
|---|---|
| `workspace/projects/<id>/companion.json` | You switch context files on or off, or star them |
| `workspace/projects/<id>/logs/companion.log` | The AI reads something through Moki's server |
| `<folder>/.mcp.json` and `<folder>/.moki-backup/` | **Connect Claude Code**, after you confirm |
| `<linked folder>/.cursor/mcp.json` and `.moki-backup/` | **Sync MCP Servers to Cursor**, after you confirm |
| `workspace/library/usage.json` | You start an activity, agent or operation from the panel (the count behind "most used") |
| `workspace/projects/<id>/runs/…` | Activities and operations started from the panel, as in the app |
| `<Documents>/Moki` | The framework copy, refreshed when a new version of the extension starts |

## Limits

- One project per VS Code window at a time.
- Projects, MCP servers, agents and operations are created and edited in the app; the IDE uses them.
- The workspace is chosen when VS Code starts (the one active in the app).
- `.mcp.json` is a snapshot: connect again after changing servers or project.
- The extension is built and tested for VS Code. Editors based on VS Code (Cursor and others) may install it, but that has not been verified.
