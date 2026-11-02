# Privacy and isolation

The binding rules are in [core/isolation-policy.md](../core/isolation-policy.md) (loaded by every skill). This page explains how they are enforced.

## What this repository versions

Only the framework: skills, core policies, workflows, templates, schemas, adapters, generic docs, synthetic examples, scripts and tests.

## What it never versions

Everything under `workspace/` and `workspaces/` (other workspaces created by the desktop app): project context, received documents, user stories, spreadsheets, PDFs, logs, evidence, screenshots, traces, temporary files, automation results, run history and any customer data. Also `dist/` (generated bundles).

## Layers of protection

| Layer | What it does | Limit |
|---|---|---|
| Folder layout | Every project has its own folder; skills write only there | Relies on the AI following instructions |
| Skill instructions | Isolation policy loaded by every skill; project identified before reading anything | Same |
| `.gitignore` | Ignores `workspace/*`, `workspaces/` and `dist/` | `git add -f` bypasses it — it is not a security control |
| Pre-commit hook (`npm run setup`) | Blocks commits containing workspace files, documents/images/evidence outside skill assets, `.env` files, known secret formats, and stale skill mirrors | Must be enabled per clone; can be skipped with `--no-verify` |
| CI (`.github/workflows/ci.yml`) | Same checks on every push/PR | Runs after the push — rotate any leaked secret anyway |
| `npm run runs` | Flags runs whose `state.json` names another project or artifacts outside the project | Checks state, not content |

## Project isolation

- One folder per system: `workspace/projects/<project-id>/` (or `<workspace>/projects/<project-id>/` in another workspace). Workspaces never share anything; inside one, project tags share only the files the activity request lists (see [core/isolation-policy.md](../core/isolation-policy.md#shared-context-through-tags)).
- An activity reads only its project's folder; cross-project comparison only when the user explicitly asks and names both projects.
- No per-project branches in this repository.

## Optional private context repository

A team may version `workspace/projects/<project-id>/` as its **own private Git repository** (see the README inside each project folder). Its `.gitignore` excludes `runs/`, `inbox/` and `temporary/`, so activity results stay unversioned there too. This repository's Git ignores the whole `workspace/`, so the two never mix.

## Desktop app

The `qa` desktop app reads and writes only inside the open project's folder, never opens executables or scripts, and sends no project data over the network: it opens the AI tool you choose, and that tool talks to its provider under your own account and settings. An upload of skills or a `.claude` folder is read from the file or folder you choose in the system dialog, checked (secrets, `.env*`, keys and local settings are never installed; settings, hooks, commands and MCP files are never imported) and installed only after you pick the items and confirm. The app contacts the network only when you ask: the SkillMD registry (`api.skillmd.com`) and GitHub (`api.github.com`, `github.com`, to download an ArtCraft app, checked by SHA-256 and saved where you choose in the system dialog, never installed or run by Moki). Details: [desktop-app.md](desktop-app.md).

## Target repositories

When automation is authorized to change a target system's repository, files are created there and that repository's own Git policy applies. This repository's `.gitignore` does not affect other repositories.

## External services

Uploading project documents to a chat AI, a search engine or any API sends them to that provider. Do it only where your organization allows; record the decision in `project.json` (`externalDataSharingAllowed`). Skills ask before sending project data externally.

## Credentials

Never in any file of this repository or of a project folder. Reference them by environment variable name. `.env` files are ignored and blocked by the pre-commit check.
