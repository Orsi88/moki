# Artifact and Project Isolation Policy

This policy is mandatory for every skill. It overrides any instruction that would place generated or received files elsewhere.

## Two kinds of content

| Kind | Where | Versioned? |
|---|---|---|
| Framework (skills, workflows, templates, adapters, generic docs) | repository folders | Yes, in this public repository |
| Everything about a specific system, and everything produced or received while working | `workspace/` | **Never** in this repository |

`workspace/` is fully ignored by this repository's Git. There are no per-project branches in this repository.

## Project folder layout

Each system under test is a project with its own folder:

```text
workspace/projects/<project-id>/
├── project.json              # identity, repositories, environments, tools, constraints
├── context/                  # CONFIRMED knowledge only (glossary, rules, modules, flows...)
├── proposed-updates.md       # knowledge waiting for confirmation (never treated as fact)
├── activity-log.md           # one line per run: date, skill/workflow, run id, outcome
├── inbox/                    # files the user provides for this project
├── runs/<run-id>/            # one folder per execution
│   ├── state.json            # progress, pending items, approvals, artifacts
│   ├── inputs/  outputs/  evidence/  logs/
└── temporary/                # scratch files
```

Use `workspace/temporary/` only for scratch work that is not tied to a project.

## Project isolation (mandatory)

- Every activity belongs to exactly one project. Identify it before reading any context. If it is ambiguous, ask.
- Read and write only inside `workspace/projects/<project-id>/` of the active project.
- Never read, quote, reuse or compare another project's context, inputs or results, unless the user explicitly asks for a cross-project comparison and names both projects, or the request lists them as shared context (see below).
- Never carry knowledge from a previous conversation about another project into the current one.
- Never mix outputs of two projects in one run.

## Workspaces

`workspace/` is the default workspace. The desktop app can open other workspaces: folders with the same layout (`projects/`, `tags.json`, ...), by default under `workspaces/<name>/` (ignored by Git) or anywhere the user chooses. When a request names a workspace folder, it replaces `workspace/` in every path of this policy. Only the active workspace exists for an activity: never read, list or write another workspace, and tags never share context across workspaces.

## Shared context through tags

The user can tag projects and files (catalog in `workspace/tags.json`, a project's tags in its `project.json` `tags`, its files' tags in `workspace/projects/<project-id>/tags.json`). A tag shares, with every project that has it, the confirmed `context/` of the other projects with the tag and each file tagged with it. The request that starts an activity lists the shared files the user kept; that list is the user's explicit authorization for the activity.

- Read only the shared files listed in the request, and nothing else from other projects. Without such a list, the rules above apply unchanged.
- Shared files are read-only. Never write, move or delete anything in another project.
- Cite the source project (and file) of anything taken from shared context.
- Knowledge from shared context is never confirmed context of the active project: propose it in `proposed-updates.md` and promote it only after approval.
- Record the shared files read in the run's `state.json` under `contextSources`.
- When the request says a file of the active project must not be used in the activity, do not read or use it.
- Sharing between projects never authorizes sending data to external services; `externalDataSharingAllowed` still applies.

## Forbidden destinations

Never write generated or received content into `skills/`, `core/`, `templates/`, `schemas/`, `adapters/`, `docs/`, `examples/`, `.agents/`, `.claude/` or the repository root. Those folders define the framework; they are not storage.

Test code (specs, flows, utils, fixtures) is never created in this repository. The only exception is when the user explicitly asks to develop a **generic template of the framework itself** (under `templates/`), which must contain no project-specific content.

## Exception: authorized changes to a target repository

When a skill (for example, automation) is explicitly authorized to modify a target system's repository, files are created **in that repository**, and that repository's own version-control policy applies to them. This framework's `.gitignore` does not and must not affect other repositories. Evidence and reports about that work still go to the run folder.

## Optional: versioning a project's context privately

A team may version `workspace/projects/<project-id>/` in its **own private Git repository** (a separate `git init` inside that folder). The project template ships a `.gitignore` that keeps `runs/`, `inbox/` and `temporary/` out of it, so activity results stay unversioned there too. Never push project context to this public framework repository. Skills must not create, commit to or push that private repository unless the user asks.

## Additional protections

- Never store credentials, tokens, passwords or personal data in any versioned file, including `project.json` and context files. Refer to credentials by the name of an environment variable or secret, never by value.
- `.gitignore` is not a security control. Do not treat ignored files as protected or private.
- Do not modify, move or delete user files without explicit authorization.
- Do not send corporate or customer data to external services (web search, third-party APIs, public paste sites) unless `project.json` allows it (`externalDataSharingAllowed: true`) and the user authorizes it for the task.
- Examples committed to this repository must be synthetic. Never copy real project content into `examples/`.
- If you are unsure whether a file may be versioned, assume it may not and put it in the project folder.

## When the tool cannot write files

In chat-only environments (no file system access), present outputs in the conversation and tell the user which path under `workspace/projects/<project-id>/` to save each one to.
