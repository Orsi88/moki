# Using Moki

## Inside a project

**Inside a project.** A tree of the project: context, inbox, activities, notes. Drop files onto the window and they are copied into the inbox — up to 40 files, 200 MB each. Folders are skipped. Drag a file onto another folder to move it there, or drop a file from the computer onto a folder to copy it into that folder. Execution files stay out of both. Markdown is formatted in a TipTap editor, and a drawing or diagram there stays a card that is drawn; **Ctrl+E** switches to the source, **Ctrl+S** saves, **Ctrl+W** closes. The reload button on the file reads it from disk again, so a version the AI just wrote shows up without closing the tab. The ⋯ menu and a right-click can send a file or folder to the trash; the fixed folders (context, inbox, notes, temporary, execution files) are emptied and stay, and `project.json` is not deleted that way. Deleting a project for good is on the project list and does not use the trash. The assistant card can also start by naming a skill: the request opens in the chosen AI and cites that skill. Word files are turned into text so any AI can read them. Excel files show their values and PDFs open with selectable text; with PdfCraft installed you can highlight and comment on them, and edit their pages (rotate, move, insert, delete) and their title and author (a file from the inbox, and any page edit, goes to an `-edited.pdf` copy). The button next to them opens either in its own program, and "…" lets you choose it (Excel, Word and PDF). Files the AI saves show up in the tree as they land.

**Open in your AI tool** (the play button):

1. Choose the activity.
2. Optionally choose which inbox files to include, which shared context to keep (when the project has tags, see [Tags](#tags)) and who should do it (an agent).
3. Add a note and pick the tool. It starts on your default AI (**Settings › My AIs**); picking another one here is for this request only.

Claude Code, Codex, Gemini CLI, Antigravity CLI and Cursor Agent open in a terminal tab of the app. Cursor and VS Code open the folder with the request copied. ChatGPT, claude.ai, Gemini web, and *Just show the request*, leave the text on the screen ready to copy. If opening is still running after about 20 seconds, the wizard says so.

To talk an idea through without an activity, the project panel's **Call an agent** picks one of the project's agents (and, optionally, what about) and opens your AI as that agent, for a conversation: no run starts and nothing is written unless you ask.

Then you talk in that tool as usual. The request names the project, the linked folder, and the skills and agents installed for it.

**Settings** (the gear) has seven tabs; besides My AIs, each one is a list with filters and a search field:

| Tab | What you do there |
|---|---|
| **Agents** | Roles that use one or more skills. Duplicate a built-in one, or create your own; tags say which projects it reaches. |
| **Activities** | The ready-made requests you pick in "Open in your AI tool": the ones of Moki, and your own (what to ask, of which skill, agent, workflow or operation, with which files). See [Activities](activities.md). |
| **My AIs** | The AI tools Moki opens (terminal and editor), each with its version (the path in its tooltip). The card's icon does its main action (install, or install or update the Moki extension) and its **…** menu has the others, such as **Make default**, the one activities start in. **Install** a missing terminal AI: a terminal tab shows the official command and runs it only after you type `y`; then **Check again**. For VS Code and Cursor, **Install the Moki extension and open** installs the extension of this app's version (from its release, checked by SHA-256) and opens the editor on the project's linked folder; a missing editor gets **Download**. In Cursor the extension is marked *Not verified*. An AI not found here, chosen while starting an activity, brings you to this tab. |
| **Operations** | Agents linked by arrows into a multi-agent operation. See [Agents and operations](agents.md). |
| **Skills** | What is already installed, what ships with Moki, the app plugins (in purple), and **Add a skill**: search the public [SkillMD](https://skillmd.com) registry, describe one for your AI tool to draft, or **Upload** skills and agents from a `.claude` folder (or a `.zip`) on your computer. The same upload is in **Set up project** (for the project or for every project) and on the start screen without a project open (for every project). You choose the items and confirm before anything is installed. Caveman and superpowers stay off until you turn them on in the project's Skill tab; they then load in every AI session opened from that project. |
| **MCP servers** | The tools the AI gets, global or for chosen projects. See [MCP servers](mcp-servers.md). |
| **Templates** | Font, colours, header, footer, logo and watermark for the PDF, Word and Excel files activities generate; tags say which projects use each one. |

**ArtCraft apps.** The **+** menu of the terminals ends with **Download ArtCraft apps…**: the 16 apps of the [ArtCraft Launcher](https://github.com/storytold/craft-launcher) suite (the launcher first: it installs and updates the others). **Download** shows the file, the release and the address, and asks you to confirm; Moki then downloads the file for your computer, checks its SHA-256, saves it where you choose in the system dialog and shows the folder. When your system has more than one format (on Linux, the package of your distro such as .rpm or .deb, an AppImage or a .tar.gz; on Windows, an .msi or a portable .zip), you choose which one, with the best fit marked as recommended. It never installs or runs it: open the file yourself (an .rpm or .deb runs its install scripts when you open it). Messages: [Troubleshooting](troubleshooting.md).

**Favorites.** The star on a card of Activities, Agents, Operations, Templates or Skills makes it a favorite: favorites come first in their list, and starred activities come first wherever an activity is picked. They are kept per workspace in `library/favorites.json`.

Notes on a project are Markdown files under `notes/` and open in their own window. Loose notes on the start screen stay in the app until you send one to a project. In a PDF, selecting text offers **Create a note from here**: a note in the same project's `notes/`, titled `<file> p<page>`, with the quote and a source line (file, page, rect in points); the PDF is not changed. A project note can be exported from its window as **PDF** (needs Edge, Chrome or Chromium), **Markdown** or **text**: a save dialog asks where, and the file goes there (outside the workspace, only by that choice); images embedded in the note are kept in the PDF and Markdown and left as `[description]` in text.

## Projects

A project is one body of work. Its id is short and lowercase (`billing-portal`), and its folder is `workspace/projects/<id>/` — or `<workspace folder>/projects/<id>/` in another workspace.

A quality project looks like this. A blank project has the same skeleton and gains `context/` only after you approve `plan.json`.

```text
workspace/projects/billing-portal/
├── project.json          # name, language, linked folder, who may see data
├── context/              # confirmed knowledge only
├── proposed-updates.md   # things the AI noticed, waiting for you
├── plan.json             # blank projects: the plan, until you approve it
├── tags.json             # tags of single files
├── activity-log.md
├── inbox/                # files you hand to the AI
├── notes/
└── runs/<run-id>/        # one folder per activity
    ├── state.json        # current step, so you can stop and resume
    ├── inputs/  outputs/  evidence/  logs/
```

During an activity the AI may notice something that looks like a general rule. It writes that to `proposed-updates.md` and asks you before it becomes context. Confirmed text is the only text it may treat as known.

Deliverables are in **English** unless you set `"deliverableLanguage": "pt-BR"` in `project.json`, or ask for another language in the activity. The conversation follows the language you write in. Quoted messages stay in their original language.

## Tags

Tags connect projects of the same workspace. Give a project or a file a tag (under the project name, or in the bar above an open file); type a new name to create one.

A project with a tag can use, in its activities:

- the **confirmed context** (`context/`) of every other project with that tag — not their inbox, runs or evidence;
- every **file** tagged with it, in any project.

When you open an activity, a *Which context should the AI consider?* step lists those files, all checked. Uncheck what this activity should not use; files of the project itself can be left out there too. The request then lists exactly the shared files the AI may read. It reads them only, writes nothing in the other projects, says which project each piece came from, and proposes new knowledge in `proposed-updates.md` instead of treating it as confirmed.

The tag catalog is `tags.json` in the workspace folder; a project's tags are in its `project.json`.

## Sharing a project

To share context with a team, put **that project folder** in its own private Git repository. It already ignores `runs/`, `inbox/` and `temporary/`. Project data does not belong in this public repository.

## Come back later

Close the session whenever you want. Each activity writes `state.json` as it goes. Ask the AI to continue that run — in the same tool or another — and it reads the file, summarizes where you stopped, and goes on from there. The tools do not share a memory. The files are the memory. In a chat tool, upload `state.json` and the relevant context again.

## Where things live

| What | Where |
|---|---|
| The app's library and your projects, after the installer | `Documents/Moki` |
| Other workspaces | `workspaces/<name>/` in the Moki folder, or the folder you chose; the list is `workspaces/workspaces.json` |
| One project | `workspace/projects/<id>/` (or `projects/<id>/` in another workspace) |
| Confirmed knowledge | `.../context/` |
| One activity | `.../runs/<run-id>/` |
| Skills and agents for this project | `workspace/projects/<id>/skills` and `agents`, or `<linked folder>/.claude/` |
| Skills and agents for every project | `~/.claude/skills`, `~/.agents/skills`, `~/.claude/agents` |
| Copies of built-in agents | `workspace/library/agents/` |
| Document style | `workspace/document-style.json`, or the same file inside one project |
| Tags | `workspace/tags.json` (catalog), `project.json` → `tags`, and `tags.json` inside a project (its files) |
