# Moki

🇧🇷 [Leia em português](README.pt-BR.md)

<p align="center"><img src="app/public/hero.png" alt="Moki" width="280" /></p>

<p align="center">
  <a href="https://github.com/Orsi88/moki/releases/latest"><b>⬇️ Download Moki for Windows</b></a>
  &nbsp;·&nbsp; <a href="https://github.com/Orsi88/moki/releases/download/v0.4.1/Moki.Setup.0.4.1.exe">Moki.Setup.0.4.1.exe</a>
  &nbsp;·&nbsp; <a href="https://github.com/Orsi88/moki/wiki">documentation</a>
</p>

Moki is a local app for the AI tool you already use. It keeps a project on your computer — files, confirmed knowledge, skills and the record of each activity — and opens Claude Code, Cursor, Codex, Gemini or a chat with the request ready.

Your AI tool does the work. Moki prepares the request and keeps the files. There is no account and no server.

It started as software quality work: review a story, design tests, look at a failure, assemble evidence. That still ships with the app. A project can also be a folder you already have, a blank project the AI plans with you, or skills and agents you add yourself.

---

## Install

1. Download [Moki.Setup.0.4.1.exe](https://github.com/Orsi88/moki/releases/download/v0.4.1/Moki.Setup.0.4.1.exe) (or the latest file on [Releases](https://github.com/Orsi88/moki/releases)).
2. If Windows says it protected your PC, choose **More info → Run anyway**. The installer is not digitally signed yet.
3. Install an AI tool too (Claude Code, Cursor, Codex, Gemini, or a chat you already use).

For VS Code, download [moki-0.4.1.vsix](https://github.com/Orsi88/moki/releases/download/v0.4.1/moki-0.4.1.vsix) and run `code --install-extension moki-0.4.1.vsix`: [Moki in the IDE](https://github.com/Orsi88/moki/wiki/Moki-in-the-IDE).

Your projects live in **Documents\Moki**, and a newer installer never touches them. macOS, Linux and running from the source: [Getting started](https://github.com/Orsi88/moki/wiki/Getting-started).

## First steps

1. Open Moki and choose a **workspace** (a folder of projects, like an Obsidian vault).
2. Create a **project** (only a name, or customized with tags and setup) or open a folder you already have as one.
3. Drop the stories, logs or documents onto the window: they go to the project's inbox.
4. Press **play**, choose the activity and your AI tool. The request opens there, ready.
5. Talk to the AI as usual. Each activity records where it stopped, so you can come back later, in the same tool or another.

## What it does

| Activity | What you get |
|---|---|
| [Review user stories](skills/requirements-review/SKILL.md) | Ambiguities, gaps, one question at a time, a review matrix (Excel) and a final definitions report (PDF) |
| [Design tests](skills/test-design/SKILL.md) | Scenario map, then — after your OK — manual test cases in Excel |
| [Failure pre-analysis](skills/failure-analysis/SKILL.md) | A short note for developers, from your description and the log |
| [Build test evidence](skills/qa-orchestrator/references/workflows/test-evidence.md) | The work item and the Jam recordings, then a spreadsheet and a Word document with the prints |
| [Project context](skills/project-context/SKILL.md) | Onboarding, updates, and the plan for a blank project |

Agents chain these into **multi-agent operations**, MCP servers give the AI your tools (Playwright, Azure DevOps, Jira…), and the **VS Code extension** brings the project's context to the AI of your editor.

## Documentation

The full documentation is in the [wiki](https://github.com/Orsi88/moki/wiki):

| Guide | What is in it |
|---|---|
| [Getting started](https://github.com/Orsi88/moki/wiki/Getting-started) | Install, workspaces, projects, running from the source |
| [Using Moki](https://github.com/Orsi88/moki/wiki/Using-Moki) | Inside a project, opening the AI tool, settings, tags, coming back later, where things live |
| [QA skills and agents](https://github.com/Orsi88/moki/wiki/QA-skills-and-agents) | The activities, their status, your own skills |
| [Agents and operations](https://github.com/Orsi88/moki/wiki/Agents-and-operations) | Agents, contracts and multi-agent operations |
| [MCP servers](https://github.com/Orsi88/moki/wiki/MCP-servers) | The tools the AI gets, per project |
| [Moki in the IDE](https://github.com/Orsi88/moki/wiki/Moki-in-the-IDE) | The VS Code extension: install, configure, every way to use it |
| [Troubleshooting](https://github.com/Orsi88/moki/wiki/Troubleshooting) | Common problems and what to do |

The wiki is published from [docs/](docs/), where the documentation is edited.

## Privacy

Projects stay on your computer and are never part of this repository. The AI reads the active project, plus only the shared files the request lists because of tags you set. Passwords and tokens do not belong in any file: refer to an environment variable by name. Details: [Privacy and isolation](https://github.com/Orsi88/moki/wiki/Privacy-and-isolation).

## Contributing

```bash
git clone https://github.com/Orsi88/moki.git
cd moki
npm run setup
npm run qa
```

Before a commit: `npm run build`, `npm run typecheck`, `npm run check` and `npm test`. Documentation changes go in `docs/` (the wiki is generated from it); keep `README.md` and `README.pt-BR.md` in step. More: [Contributing](https://github.com/Orsi88/moki/wiki/Contributing).

## License

[MIT](LICENSE)
