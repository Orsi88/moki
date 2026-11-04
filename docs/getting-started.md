# Getting started

## Install

### Windows

1. Download [Moki.Setup.0.3.0.exe](https://github.com/Orsi88/moki/releases/download/v0.3.0/Moki.Setup.0.3.0.exe) (or the latest file on [Releases](https://github.com/Orsi88/moki/releases)).
2. If Windows says it protected your PC, choose **More info → Run anyway**. The installer is not digitally signed yet.
3. Finish. A **Moki** shortcut appears on the desktop and in the Start menu.

The first launch creates **Documents\Moki**: the app files and your `workspace/`, where projects live. A newer installer refreshes the app files and leaves `workspace/` and `workspaces/` alone. Uninstalling keeps them too.

Install an AI tool as well (Claude Code, Cursor, Codex, Gemini, or a chat you already use). Excel, Word and PDF from the built-in activities need [Node.js 22.18+](https://nodejs.org) (LTS). The app itself opens without it.

macOS, Linux, or a checkout of this repository: [From the source](#from-the-source).

## Use it

Open Moki and choose a **workspace**, like a vault in Obsidian. The corner of that screen chooses **English or Portuguese** and a **light or dark** theme.

**Workspaces.** A workspace is a folder with its own projects, tags and settings — for example one per client or company. The `workspace/` you already have is the first one, so nothing moves. On the first screen you can:

- open a workspace from the list (the last one opened is marked);
- **create a new workspace** — by default in `workspaces/<name>/` inside the Moki folder, or in a folder you choose;
- **open a folder as a workspace** — a folder you already have; Moki adds a `projects/` folder inside it;
- rename one, or remove it from the list (its folder stays on the computer).

Switch workspaces at the bottom of the project list, or go back to the list with *Manage workspaces…*. Projects of one workspace never see another one.

**Start screen.** Projects on the left, loose notes under them, the workspace at the bottom. Pin a project to keep it at the top. Hide one and the files stay on the computer; it moves under **Hidden** until you show it again. Pins and hidden projects are kept per workspace; loose notes belong to none.

**Search** (the magnifier, or **Ctrl+Shift+F**) takes the place of the list and looks through the active workspace: project names and descriptions, and the names and text of the project files (Markdown, text, JSON, CSV and the text of Word files). Tags appear there as filters; text and tags combine. A result opens the project with the file.

**Create a project** by typing a name, and optionally its tags:

| Start with | What you get |
|---|---|
| **QA context files** | Glossary, business rules, modules, flows, permissions and the rest, for a system you test. |
| **A blank project** | No context yet. You describe the goal; the AI asks what it needs and writes a plan. Context files appear only after you approve it. |
| **An existing folder** | *Open a project* picks a folder. The project takes its name (you can edit it), links that folder, and opens *Set up &lt;name&gt;*. AI settings in the folder are copied to `.moki-backup/` inside it. Nothing else there changes. |

The create form still says "one project per system you test". A blank project and a linked folder use the same form.

## From the source

Use this to run Moki from a checkout, on macOS or Linux, or to change the app. Windows users who installed the `.exe` can skip it.

You need Git and Node.js 22.18 or newer.

```bash
git clone https://github.com/Orsi88/moki.git
cd moki
npm run setup
npm run qa
```

`npm run setup` installs the tools, builds the app, creates `workspace/` and turns on the check that blocks commits of project data or secrets. Run it again after `git pull`.

### Troubleshooting: Unknown file extension `.ts` on Ubuntu/WSL

When running `npm run qa` on Ubuntu or Linux WSL, you may encounter the following error:

```text
TypeError [ERR_UNKNOWN_FILE_EXTENSION]:
Unknown file extension ".ts"
```

**Possible cause**

Some Ubuntu-packaged Node.js builds may lack native TypeScript support (Amaro), even when using a compatible Node.js version.

This issue was encountered with Node.js v22.22.1 installed at `/usr/bin/node`.

**Solution (tested on Ubuntu WSL)**

Installing the official Node.js distribution through [NVM](https://github.com/nvm-sh/nvm) resolved the issue.

If NVM is already installed, run:

```bash
nvm install 22
nvm use 22
nvm alias default 22
```

Verify that native TypeScript support is available:

```bash
node -p "process.features.typescript"
```

Expected output:

```text
strip
```

Then run:

```bash
npm run qa
```

**Result:** The application launched successfully on Ubuntu WSL after replacing the system-provided Node.js installation with the official distribution managed by NVM.

**Note:** Updating Ubuntu or checking the Node.js version alone may not resolve this issue. The Node.js distribution and its build configuration can also affect native TypeScript support.

| Command | What it does |
|---|---|
| `npm run qa` | Open the app. `npm link` once, and `qa` works from any folder. |
| `qa --terminal` | The same preparation in a terminal menu, if you prefer that to the window. |
| `npm run new-project -- <id> "<Name>" [--blank]` | Create a project folder. `--blank` leaves the QA context files out. |
| `npm run dist:win` / `dist:mac` / `dist:linux` | Build an installer on that system. Output in `release/`. |
| `npm run vscode:package` | Build the VS Code extension (`release/moki-<version>.vsix`). To try it first: `npm run vscode:build`, then `code --extensionDevelopmentPath="$PWD/ide/vscode"`. See [Moki in the IDE](ide.md). |
| `npm run check` and `npm test` | Validate the repository and run its tests. |

`qa --terminal` is in English and still asks *Which project (system under test)?*. Any project id works.
