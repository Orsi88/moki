# Using Moki

## Inside a project

**Inside a project.** A tree of the project: context, inbox, activities, notes. Drop files onto the window and they are copied into the inbox — up to 40 files, 200 MB each. Folders are skipped. Markdown is formatted; **Ctrl+E** edits, **Ctrl+S** saves, **Ctrl+W** closes. Word files are turned into text so any AI can read them. Excel files show their values and PDFs open with selectable text; with PdfCraft installed you can highlight and comment on them, and edit their pages (rotate, move, insert, delete) and their title and author (a file from the inbox, and any page edit, goes to an `-edited.pdf` copy). The button next to them opens either in its own program, and "…" lets you choose it (Excel, Word and PDF). Files the AI saves show up in the tree as they land.

**Open in your AI tool** (the play button):

1. Choose the activity.
2. Optionally choose which inbox files to include, which shared context to keep (when the project has tags, see [Tags](#tags)) and who should do it (an agent).
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
