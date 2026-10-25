# Moki

🇧🇷 [Leia em português](README.pt-BR.md)

<p align="center"><img src="app/public/hero.png" alt="Moki" width="280" /></p>

<p align="center">
  <a href="https://github.com/Orsi88/quality-agents/releases/latest"><b>⬇️ Download Moki for Windows</b></a>
  &nbsp;·&nbsp; <a href="https://github.com/Orsi88/quality-agents/releases/download/v0.2.1/Moki.Setup.0.2.1.exe">Moki.Setup.0.2.1.exe</a>
  &nbsp;·&nbsp; <a href="#install">how to install</a>
</p>

Moki is a local app for the AI tool you already use. It keeps a project on your computer — files, confirmed knowledge, skills and the record of each activity — and opens Claude Code, Cursor, Codex, Gemini or a chat with the request ready.

Your AI tool does the work. Moki prepares the request and keeps the files. There is no account and no server.

It started as software quality work: review a story, design tests, look at a failure, assemble evidence. That still ships with the app. A project can also be a folder you already have, a blank project the AI plans with you, or skills and agents you add yourself.

---

## Install

### Windows

1. Download [Moki.Setup.0.2.1.exe](https://github.com/Orsi88/quality-agents/releases/download/v0.2.1/Moki.Setup.0.2.1.exe) (or the latest file on [Releases](https://github.com/Orsi88/quality-agents/releases)).
2. If Windows says it protected your PC, choose **More info → Run anyway**. The installer is not digitally signed yet.
3. Finish. A **Moki** shortcut appears on the desktop and in the Start menu.

The first launch creates **Documents\Moki**: the app files and your `workspace/`, where projects live. A newer installer refreshes the app files and leaves `workspace/` alone. Uninstalling keeps that folder too.

Install an AI tool as well (Claude Code, Cursor, Codex, Gemini, or a chat you already use). Excel, Word and PDF from the built-in activities need [Node.js 22.18+](https://nodejs.org) (LTS). The app itself opens without it.

macOS, Linux, or a checkout of this repository: [From the source](#from-the-source).

## Use it

Open Moki. The last project comes back on its own. The corner of the start screen chooses **English or Portuguese** and a **light or dark** theme. Creating a project is a button on that screen, not a step you have to take.

**Start screen.** Projects on the left, loose notes under them. Pin a project to keep it at the top. Hide one and the files stay on the computer; it moves under **Hidden** until you show it again.

**Create a project** by typing a name:

| Start with | What you get |
|---|---|
| **QA context files** | Glossary, business rules, modules, flows, permissions and the rest, for a system you test. |
| **A blank project** | No context yet. You describe the goal; the AI asks what it needs and writes a plan. Context files appear only after you approve it. |
| **An existing folder** | *Open a project* picks a folder. The project takes its name (you can edit it), links that folder, and opens *Set up &lt;name&gt;*. AI settings in the folder are copied to `.moki-backup/` inside it. Nothing else there changes. |

The create form still says "one project per system you test". A blank project and a linked folder use the same form.

**Workspace.** A tree of the project: context, inbox, activities, notes. Drop files onto the window and they are copied into the inbox — up to 40 files, 200 MB each. Folders are skipped. Markdown is formatted; **Ctrl+E** edits, **Ctrl+S** saves, **Ctrl+W** closes. Word files are turned into text so any AI can read them. Excel and PDF open in their own program. Files the AI saves show up in the tree as they land.

**Open in your AI tool** (the play button):

1. Choose the activity.
2. Optionally choose who should do it (an agent) and which inbox files to include.
3. Add a note and pick the tool.

Claude Code, Codex, Gemini CLI, Antigravity CLI and Cursor Agent open in a terminal tab of the app. Cursor and VS Code open the folder with the request copied. ChatGPT, claude.ai, Gemini web, and *Just show the request*, leave the text on the screen ready to copy. If opening is still running after about 20 seconds, the wizard says so.

Then you talk in that tool as usual. The request names the project, the linked folder, and the skills and agents installed for it.

**Settings** (the gear) has three tabs:

| Tab | What you do there |
|---|---|
| **Agents** | Roles that use one or more skills. Duplicate a built-in one, or create your own for this project or for every project. |
| **Skills** | What is already installed, what ships with Moki, and **Add a skill**: search the public [SkillMD](https://skillmd.com) registry (programming, design, QA, security, docs) or describe one for your AI tool to draft. |
| **Documents** | Font, colours, header, footer, logo and watermark for the PDF, Word and Excel files activities generate. One style for every project, or a project's own. |

Notes on a project are Markdown files under `notes/` and open in their own window. Loose notes on the start screen stay in the app until you send one to a project.

## Projects

A project is one body of work. Its id is short and lowercase (`billing-portal`), and its folder is `workspace/projects/<id>/`.

A quality project looks like this. A blank project has the same skeleton and gains `context/` only after you approve `plan.json`.

```text
workspace/projects/billing-portal/
├── project.json          # name, language, linked folder, who may see data
├── context/              # confirmed knowledge only
├── proposed-updates.md   # things the AI noticed, waiting for you
├── plan.json             # blank projects: the plan, until you approve it
├── activity-log.md
├── inbox/                # files you hand to the AI
├── notes/
└── runs/<run-id>/        # one folder per activity
    ├── state.json        # current step, so you can stop and resume
    ├── inputs/  outputs/  evidence/  logs/
```

During an activity the AI may notice something that looks like a general rule. It writes that to `proposed-updates.md` and asks you before it becomes context. Confirmed text is the only text it may treat as known.

Deliverables are in **English** unless you set `"deliverableLanguage": "pt-BR"` in `project.json`, or ask for another language in the activity. The conversation follows the language you write in. Quoted messages stay in their original language.

To share context with a team, put **that project folder** in its own private Git repository. It already ignores `runs/`, `inbox/` and `temporary/`. Project data does not belong in this public repository.

## Skills and agents

A **skill** is the instructions for one activity: steps, rules, output and where to stop for your approval. The AI reads them. An **agent** is a role that uses one or more skills.

The activities that ship with Moki:

| Activity | What you get | Status |
|---|---|---|
| [Review user stories](skills/requirements-review/SKILL.md) | Ambiguities, gaps, one question at a time, a review matrix (Excel) and a final definitions report (PDF). | ready |
| [Design tests](skills/test-design/SKILL.md) | Scenario map, then — after your OK — manual test cases in Excel. | ready |
| [Failure pre-analysis](skills/failure-analysis/SKILL.md) | A short note for developers, from your description and the log. | ready |
| [Build test evidence](skills/qa-orchestrator/references/workflows/test-evidence.md) | The work item and the Jam recordings, then a spreadsheet and a Word document with the prints, in your own models when you have them. | ready |
| [Project context](skills/project-context/SKILL.md) | Onboarding, updates, and the plan for a blank project. | ready |
| [Automation](skills/automation/SKILL.md) | Build, implement or evolve an automation project. | not available yet |
| [Documentation](skills/documentation/SKILL.md), [smoke test](skills/smoke-test/SKILL.md) | Planned. The AI will say so and stop. | not available yet |

**Ready** means usable, still being checked across AI tools. Ask in plain language ("review this story", "map the tests", "here is the log"). The built-in ones identify the project, record a run, and stop when they need a decision. "ok", "approved" or "go ahead" accepts the step in front of you. They do not invent requirements, messages or results: a gap becomes a pending item.

Chains such as "review this, and once I approve it, map the tests" go through the orchestrator, which shows the plan and waits at each gate. The definitions are in [skills/qa-orchestrator/references/workflows/](skills/qa-orchestrator/references/workflows/).

Skills you add live with the project (`<linked folder>/.claude/skills/` or `workspace/projects/<id>/skills/`) or for every project (`~/.claude/skills/` and `~/.agents/skills/`). Agents you create follow the same split; a copy of a built-in agent stays in `workspace/library/agents/`. The request names them. Moki does not run a skill by itself. More on agents: [docs/agents.md](docs/agents.md).

## Come back later

Close the session whenever you want. Each activity writes `state.json` as it goes. Ask the AI to continue that run — in the same tool or another — and it reads the file, summarizes where you stopped, and goes on from there. The tools do not share a memory. The files are the memory. In a chat tool, upload `state.json` and the relevant context again.

## Where things live

| What | Where |
|---|---|
| The app's library and your projects, after the installer | `Documents/Moki` |
| One project | `workspace/projects/<id>/` |
| Confirmed knowledge | `.../context/` |
| One activity | `.../runs/<run-id>/` |
| Skills and agents for this project | `workspace/projects/<id>/skills` and `agents`, or `<linked folder>/.claude/` |
| Skills and agents for every project | `~/.claude/skills`, `~/.agents/skills`, `~/.claude/agents` |
| Copies of built-in agents | `workspace/library/agents/` |
| Document style | `workspace/document-style.json`, or the same file inside one project |

## Privacy

Projects stay on your computer. `workspace/` is not part of this Git repository. Projects are separate folders; the AI reads the active one. Passwords and tokens do not belong in any file — refer to an environment variable by name. Sending documents to an online AI is your decision and that provider's policy; record the team's rule in `project.json` → `externalDataSharingAllowed`.

Details: [docs/privacy-and-isolation.md](docs/privacy-and-isolation.md).

## From the source

Use this to run Moki from a checkout, on macOS or Linux, or to change the app. Windows users who installed the `.exe` can skip it.

You need Git and Node.js 22.18 or newer.

```bash
git clone https://github.com/Orsi88/quality-agents.git
cd quality-agents
npm run setup
npm run qa
```

`npm run setup` installs the tools, builds the app, creates `workspace/` and turns on the check that blocks commits of project data or secrets. Run it again after `git pull`.

| Command | What it does |
|---|---|
| `npm run qa` | Open the app. `npm link` once, and `qa` works from any folder. |
| `qa --terminal` | The same preparation in a terminal menu, if you prefer that to the window. |
| `npm run new-project -- <id> "<Name>" [--blank]` | Create a project folder. `--blank` leaves the QA context files out. |
| `npm run dist:win` / `dist:mac` / `dist:linux` | Build an installer on that system. Output in `release/`. |
| `npm run check` and `npm test` | Validate the repository and run its tests. |

`qa --terminal` is in English and still asks *Which project (system under test)?*. Any project id works.

### Changing Moki

Edit `skills/` and `core/` for behaviour, `app/` and `desktop/` for the window. Then:

```bash
npm run build
npm run typecheck
npm run check
npm test
```

Do not edit `.agents/skills/` or `.claude/skills/` by hand; `npm run build` rewrites them. Keep examples synthetic. When this guide changes, update `README.md` and `README.pt-BR.md` together.

How the window is built: [docs/desktop-app.md](docs/desktop-app.md). How a skill is shaped: [docs/skill-standard.md](docs/skill-standard.md).

| Path | What it is |
|---|---|
| `AGENTS.md` | What an AI tool reads when this folder is opened: rules and the skill catalog |
| `skills/`, `agents/`, `core/` | Skills, built-in agents, shared policies — edit here |
| `app/`, `desktop/` | The window |
| `workspace/` | Local projects — never versioned |

## License

[MIT](LICENSE)
