# Moki — instructions for AI agents

This repository is a portable library of **QA skills** (Agent Skills format). You, the AI tool, execute them; the skills define responsibilities, procedures, rules, inputs, outputs and approval points. Nothing here depends on a specific AI vendor.

## Golden rules

1. **Identify the project first.** Every activity belongs to one project in `workspace/projects/<project-id>/`. Never read or reuse another project's files, except the shared context (through tags) that the request lists.
2. **Files go to the project folder.** Inputs, outputs, evidence, logs and state live under `workspace/projects/<project-id>/` (ignored by Git). Never write them into `skills/`, `core/`, `templates/`, `schemas/`, `adapters/`, `docs/`, `examples/` or the repository root.
3. **Stop at approval gates.** Never run a step that needs approval in the same response that asks for it.
4. **Never invent** requirements, rules, messages, data or ids. Missing information becomes a pending item. Hypotheses are labeled as hypotheses.
5. **No shared memory.** Continuity comes only from files you read explicitly (`state.json`, project context).
6. **Language.** Talk to the user in their language. Deliverables are in **English** by default, or in the project's `deliverableLanguage`, or in the language the user explicitly asks for. Quoted source content (documented messages, log lines) stays in its original language.
7. **No secrets, no external sharing** of project data without configuration and authorization.

Full policies: [core/isolation-policy.md](core/isolation-policy.md), [core/approval-policy.md](core/approval-policy.md), [core/persistence-protocol.md](core/persistence-protocol.md), [core/traceability.md](core/traceability.md), [core/execution-principles.md](core/execution-principles.md).

## Skill catalog

Canonical definitions are in `skills/<name>/SKILL.md` (tools load the generated copies in `.agents/skills/` or `.claude/skills/`, which are identical).

| Skill | Status | Use when | Required inputs | Depends on |
|---|---|---|---|---|
| `qa-orchestrator` | draft | Composite requests, resuming work, unclear which skill applies | The request | `project-context` |
| `project-context` | draft | Start of any activity; new project onboarding; updating project knowledge | Project id or name | — |
| `requirements-review` | draft | Review/refine/validate user stories before development (never writes test cases) | One or more user stories | `project-context` |
| `test-design` | draft | Map scenarios, then (after OK) write manual test cases | Stories/rules/criteria | `project-context`; optionally `requirements-review` output |
| `failure-analysis` | draft | Pre-analysis of an error from description + log | Item description, failure moment, date/time, log | `project-context` (optional) |
| `evidence-collection` | draft | Assemble the evidence of an executed test: work item (MCP or pasted), Jam recordings, prints → approved `evidence.json` | Source item, execution data, result per test case, Jam link or print | `project-context` |
| `evidence-sheet` | draft | Evidence spreadsheet, one row per test case, in the user's xlsx model, project standard or default | Approved `evidence.json` | `evidence-collection` |
| `evidence-document` | draft | Evidence Word document with images per step, in the user's docx model, project standard or default | Approved `evidence.json` | `evidence-collection` |
| `documentation` | planned | Propose updates to the official scenario base | — | not available |
| `automation` | pending-migration | Automation engineering: build, implement (FLX scenarios) and evolve automation projects in a target repository | — | not available until its reference materials are migrated |
| `smoke-test` | planned | Targeted pre-validation of an improvement | — | not available |
| `moki-architecture` | draft | Framework (no project): how Moki works — layers, flows, business rules, invariants | A question about the framework | — |
| `moki-change` | draft | Framework (no project): plan, review or make a change to Moki — impact, proposal with code, approval, implementation, checks | The change request or an approved proposal | `moki-architecture` |
| `cadcraft`, `deckcraft`, `designcraft`, `effectcraft`, `figcraft`, `filmcraft`, `gridcraft`, `lightcraft`, `pdfcraft`, `photocraft`, `soundcraft`, `vectorcraft`, `wordcraft` | draft | One per tool of the Craft App Suite listed by ArtCraft Launcher (`github.com/storytold/craft-launcher`), source in `github.com/storytold/<tool>`: facts, build, CLI, MCP, checks, logs, verified in the repos; QA work on a tool uses project id = skill name | A request about that tool | — |
| `craft-launcher` | draft | ArtCraft Launcher itself: suite catalog, install locations, updates and self-update, build, checks, logs, verified in the repo | A request about the launcher | — |

Status meaning: **draft** = usable, procedure complete, not yet validated in two AI tools; **pending-migration** = defined but waiting for source/reference material — do not execute; **planned** = do not execute, tell the user it is not available. Each skill can run alone (after project identification) except where it depends on another's output.

## Agents

An **agent** is a role with instructions that uses one or more skills and asks for an access level. Built-in agents are in `agents/<category>/<name>.md` (Claude Code also gets them as subagents in `.claude/agents/`); the user's own agents are in `workspace/library/agents/<category>/<name>.md`. When the user asks you to act as an agent, read its file and follow it; its skills define how the work is done.

| Agent | Category | Status | Uses skills | Access |
|---|---|---|---|---|
| `qa-lead` | quality | draft | qa-orchestrator, project-context, requirements-review, test-design, failure-analysis | project-write |
| `requirements-analyst` | quality | draft | requirements-review, project-context | project-write |
| `test-designer` | quality | draft | test-design, project-context | project-write |
| `failure-analyst` | quality | draft | failure-analysis, project-context | project-write |
| `evidence-builder` | quality | draft | evidence-collection, evidence-sheet, evidence-document, project-context | project-write |
| `automation-engineer` | quality | pending-migration | automation, project-context | repository-write |
| `quality-agents-expert` | framework | draft | project-context (reference only) | repository-write |
| `moki-consultant` | framework | draft | moki-architecture, moki-change | read-only |
| `moki-executor` | framework | draft | moki-architecture, moki-change | repository-write |
| `artcraft-router` | artcraft | draft | craft-launcher and the 13 Craft tool skills | read-only |
| `craft-launcher-specialist` | artcraft | draft | craft-launcher | read-only |
| `office-apps-specialist` | artcraft | draft | wordcraft, gridcraft, deckcraft | read-only |
| `adobe-apps-specialist` | artcraft | draft | photocraft, lightcraft, vectorcraft, filmcraft, effectcraft, designcraft, pdfcraft | read-only |

Access levels: **read-only** (reads the project or the framework, writes nothing), **project-write** (writes only inside `workspace/projects/<project-id>/`), **repository-write** (may also change a linked code repository, after an approved plan).

## How to handle a request

1. **Classify**: single activity, composite, resume, or context management. Composite or unclear → follow `qa-orchestrator`.
2. **Project**: identify it (ask if ambiguous). Load context with `project-context`; if the project is new, create it and run the progressive onboarding interview — only what the activity needs.
3. **Run**: create a run (`npm run new-run -- --project <id> --skill <name> --slug <slug>`, or manually per the persistence protocol). Load the skill's `SKILL.md`; open its `references/` files only when the procedure step needs them.
4. **Gate**: at each approval point, stop, summarize, ask, update `state.json`.
5. **Close**: record results and artifacts in `state.json`, update `activity-log.md`, offer confirmed general definitions to `project-context` as proposals.

Example: *"Review this story and, once approved, map the test scenarios"* → workflow `requirements-to-tests`: `project-context` → `requirements-review` (all its gates) → **approval** → `test-design` (mapping → **OK** → detailing).

Activities (the ready-made requests people pick in the app) are files: `activities/` in the framework, `workspace/library/activities/` for the person's own; the app's own actions (open, context, setup, plan, resume) are in code. Guide: [docs/activities.md](docs/activities.md).

Workflows: `skills/qa-orchestrator/references/workflows/` — `requirements-to-tests`, `failure-investigation`, `test-evidence`, `quality-lifecycle`.

## Interrupting and resuming

- The user may stop at any time. Persist `state.json` with `currentStep`, `pending` and the last approval; tell the user the run id.
- To resume: `npm run runs -- <project-id>` (or list `workspace/projects/<project-id>/runs/`), read the run's `state.json`, reload only the context the current step needs, summarize status, continue from `currentStep`.

## Where results go

```text
workspace/tags.json                                                # tag catalog (tags share context between projects)
workspace/projects/<project-id>/
├── project.json, context/, proposed-updates.md, activity-log.md   # project knowledge (confirmed only in context/)
├── tags.json                                                      # tags of the project's files
├── inbox/                                                         # files the user provides
└── runs/<run-id>/{state.json, inputs/, outputs/, evidence/, logs/}  # each execution
```

**Workspaces.** `workspace/` is the default workspace. The desktop app can open others (folders with the same layout, like Obsidian vaults). When the request names a workspace folder, every `workspace/...` path in this file and in the skills means that folder; paths written inside `state.json` and project files keep the `workspace/...` form, and the npm helper commands need `QA_WORKSPACE=<folder>`. Never read or write another workspace.

Exception: an authorized change to a **target repository** (e.g. automation code) is written there and follows that repository's Git policy.

## Errors and limitations

- Missing mandatory input → ask for exactly what is missing; status `awaiting-input`.
- Capability missing in this tool (no file access, no shell, no image reading, cannot create xlsx/pdf) → say so and use the skill's documented fallback. Never claim a file was created or a command ran when it did not.
- Same action failing 3 times → stop, status `blocked`, report what was tried.
- Conflicts between user instructions, project context and framework rules → user > confirmed project context > framework, but isolation, approval and truthfulness rules can never be disabled.

## Helper commands (need Node.js ≥ 20, run from the repository root)

| Command | Purpose |
|---|---|
| `npm run new-project -- <id> "<name>" [--blank]` | Create a project folder from the template (`--blank`: without the QA context files, planned with the user) |
| `npm run new-run -- --project <id> --skill <name> --slug <slug>` | Create a run with `state.json` |
| `npm run runs [-- <id>]` | List runs and validate their state |
| `npm run xlsx -- write/read/fill/inspect ...` | Build or read xlsx deliverables from a skill's layout, or fill the user's own xlsx model |
| `npm run pdf -- <report.md> <report.pdf>` | Render a Markdown report to PDF (Edge/Chrome) |
| `npm run docx -- write/inspect ...` | Build a Word deliverable (optionally inside the user's model) or read a model's structure |

## For contributors (editing this framework)

Edit `skills/` and `core/` only; then `npm run build` (regenerates `.agents/skills/` and `.claude/skills/`) and `npm run check`. Standard: [docs/skill-standard.md](docs/skill-standard.md).

Documentation is edited in `docs/` (guides in English, user guides also in `docs/pt-BR/`) and published to the GitHub wiki by `.github/workflows/wiki.yml` (`npm run wiki` builds it locally); a new page goes in `docs/wiki.json`. The README stays a short introduction; `README.md` and `README.pt-BR.md` change together.

Changes to Moki itself follow the `moki-change` skill (with `moki-architecture`): impact analysis, a proposal with code and impact, approval, then implementation and checks. Act as `moki-consultant` (read-only, ends at the proposal) to analyze or plan, and as `moki-executor` to implement an approved plan.
