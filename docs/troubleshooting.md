# Troubleshooting

Common problems, why they happen and what to do. Problems specific to the VS Code extension are in [Moki in the IDE](ide.md#exceptions-and-troubleshooting).

## Installing and opening

| What you see | Why | What to do |
|---|---|---|
| Windows says it protected your PC | The installer is not digitally signed yet | **More info → Run anyway** |
| Excel, Word or PDF deliverables are not created | The built-in activities need Node.js for those files (the app itself opens without it) | Install [Node.js 22.18+](https://nodejs.org) (LTS) |
| A project you created does not appear | Projects of one workspace never see another; another workspace is open | Switch the workspace at the bottom of the project list, or *Manage workspaces…* |

## Opening the AI tool

| What you see | Why | What to do |
|---|---|---|
| *… is not installed on this computer (command "…" not found).* | The tool is not installed, or its command is not on the PATH | Install it, or pick another tool |
| The wizard says opening is still running | The tool takes more than about 20 seconds to start | Wait, or look at the tool's own window or terminal |
| A chat tool (ChatGPT, claude.ai, Gemini web) does not open by itself | These tools get the request as text to copy | Copy the request shown on screen and paste it in the chat |

## Activities and runs

| What you see | Why | What to do |
|---|---|---|
| The AI says a skill is not available and stops | The skill is planned or waiting for its reference material ([QA skills](qa-skills.md)) | Expected; use another activity |
| The AI continues a run from the wrong point, or forgets it | AI tools do not share a memory; the run's `state.json` is the memory | Ask it to continue the run by its id; in a chat tool, upload `state.json` and the relevant context again |
| A rule the AI found is not used as known | Only confirmed context is treated as known; new rules go to `proposed-updates.md` | Review `proposed-updates.md` and confirm what is right |

## Multi-agent operations

| What you see | Why | What to do |
|---|---|---|
| A step shows **Failed** and the run **Blocked** | Its terminal closed before it wrote its summary, or its AI tool could not open | **Try again**; choose another AI when its own is not installed. What it delivered stays in its folder |
| **Waiting for you** with a question | The step's agent asked something in its terminal | Answer in the run view: it goes to the terminal, or the step reopens with your answer when its terminal is gone |
| The run asks which way to go | No arrow fits the step's result, or a step would run more times than the operation allows | Choose the next step, run it once more, or end the operation |
| Nothing starts after a step | The run is paused, waits for your approval, or you are in another project | Resume or approve it; the next step starts when you are back in the project |
| A step waits for approval although its arrow is direct | Its agent executes through an MCP server | Expected: review and approve |

Operations, agents and their contracts: [Agents and operations](agents.md).

## Terminals

| What you see | Why | What to do |
|---|---|---|
| A terminal asks to be closed | Closing a tab stops what runs in it | Confirm only when you mean to stop it; leaving the project keeps it running |
| The terminals of a project are back when you open it | They kept running while you were elsewhere | Expected; close a tab to stop it |
| All terminals stopped | The app was closed | Reopen the step or the activity |

## MCP servers

**Test**, in Settings › MCP servers, says why a server fails:

| Reason | What to do |
|---|---|
| Command not found | Install it, or correct the command |
| A variable is not set | Set the `${VARIABLE}` on this computer and restart the app |
| Credentials refused | Check the value of the variable |
| No answer in 15 seconds | Check the server, the URL or the network |
| A value looks like a token and is refused | Write `${VARIABLE}` instead and set the variable on the computer |

How servers are configured: [MCP servers](mcp-servers.md).

## For contributors

| What you see | Why | What to do |
|---|---|---|
| Tests or `npm run check` read files from `Documents/Moki`, or report links that exist | The terminal inherited `QA_ROOT` (the VS Code extension and the installed app set it) | `unset QA_ROOT QA_MCP_SERVER QA_RUN_TOOL` before running them |
| `npm run check` reports drift in `.agents/skills/` or `.claude/skills/` | Those copies are generated | `npm run build` |
| A commit is blocked | The pre-commit check found project data or something that looks like a secret | Remove it from the commit; project data never goes in this repository |

More: [Contributing](contributing.md).
