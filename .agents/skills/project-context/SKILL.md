---
name: project-context
description: Creates, retrieves and updates the context of a system under test (glossary, business rules, modules, flows, permissions, environments) stored as portable Markdown/JSON under workspace/projects/<project-id>/. Use before any QA activity to identify the project, onboard a new one through a progressive interview, load only the context an activity needs, or record newly confirmed definitions. Keeps projects isolated.
license: MIT
metadata:
  version: "0.1.0"
  status: draft
  category: core
  phase: "3"
---

# Project Context

## Purpose

Give every QA skill the specific knowledge of the system under test, without depending on any AI model's memory and without mixing projects. The context is a set of plain Markdown and JSON files any tool can read.

## Responsibilities

- **Identify** the project an activity belongs to.
- **Onboard** new projects: create the folder structure and run a progressive, prioritized contextualization interview.
- **Retrieve** existing context, selecting only what the requested activity needs.
- **Update** context only with confirmed definitions; keep unconfirmed knowledge in `proposed-updates.md`.
- **Enforce isolation**: never read or reuse another project's files.

Out of scope: reviewing requirements, designing tests or analyzing failures. This skill prepares context for those skills.

## When to use

- At the start of any activity (the orchestrator calls it first).
- When the user says "new project", "set up system X", "what do you know about project X", "update the context".
- When another skill finishes with definitions that may be general knowledge of the system (for example, a business rule confirmed during a requirements review).

Do not use to store activity results — those stay in the run folder.

## Inputs

Required:
- Project identifier (`project-id`: lowercase letters, digits, hyphens) or enough information to determine it.

Optional:
- Documents describing the system (functional docs, rule catalogs, architecture, onboarding material) placed in `workspace/projects/<project-id>/inbox/`.
- The activity that will follow (to prioritize which context to gather or load).

## Tools

- File read/write in `workspace/projects/<project-id>/`.
- Shell (optional): `npm run new-project -- <project-id> "<name>"` creates the structure from `templates/project-context/` (`--blank` leaves `context/` out). Fallback: create the same files manually (list in [context files](references/context-files.md)).
- Chat-only tools: the user uploads `project.json`, `context/index.md` and the relevant context files; the skill outputs updated file contents for the user to save.

## Procedure

### 1. Identify the project

1. If the user named a project, normalize it to a `project-id`. If not, list existing folders in `workspace/projects/` and ask which one, or whether it is a new system. Never guess between two candidates.
2. Confirm the project before reading any context. From now on, read and write only inside `workspace/projects/<project-id>/`.

### 2a. Existing project — retrieve

1. Read `project.json` and `context/index.md`.
2. Using the [retrieval map](references/context-files.md#retrieval-map), load only the files (or sections) relevant to the requested activity.
3. If the request lists **shared context** (files of other projects shared through tags), read only the listed files that matter for the activity, as read-only reference, following the [isolation policy](references/core/isolation-policy.md#shared-context-through-tags). If it says some files of this project must not be used, skip them.
4. Report briefly what was loaded (shared files with their source project), the `onboardingStatus`, and gaps that matter for this activity (for example, "no permission model recorded"). Offer to fill critical gaps with a few questions; do not force a full onboarding.

### 2b. New project — onboard

1. Create the structure (`npm run new-project` or manually). Set `onboardingStatus` to `partial`.
2. If documents were provided, read them first and pre-fill **proposals** (not confirmed context) from them.
3. Run the [progressive interview](references/onboarding-interview.md): one question at a time, highest-value topics first, prioritized by the upcoming activity. Stop when the activity has the minimum context it needs; the rest can be gathered later.
4. Record each answer the user confirms in the right `context/` file with source and confirmation date; update `context/index.md`.
5. Set `onboardingStatus` to `complete` only when every topic in the interview guide is recorded or explicitly marked unknown/not applicable by the user.

### 2c. Blank project — plan

A project with `"starter": "minimal"` ("Create a new project" with Enter, or "Open a project" with a folder, in the desktop app) has the standard folders and an empty `context/`: run the progressive onboarding as for any project and create only the context files the current activity needs, listing each in `context/index.md` and `project.json` `contextFiles`.

A project with `"starter": "blank"` in `project.json` (created with `npm run new-project -- <id> "<name>" --blank` or "A blank project" in the desktop app) has no `context/` yet. Follow [planning a blank project](references/project-plan-interview.md): interview one question at a time about what the project needs, write the plan to `proposed-updates.md` and `plan.json`, and stop until the user approves it. After approval, create only the approved context files.

### 3. Hand over context

Provide the next skill only the relevant excerpts, with their file paths, plus the list of known gaps. Never pass `proposed-updates.md` content as fact. Excerpts from shared context name their source project and stay reference: they are not this project's confirmed context.

### 4. Update context

Follow [context update rules](references/context-updates.md):
1. Any skill may append proposals to `proposed-updates.md` (id `PU-###`).
2. Present pending proposals to the user in small batches; one decision per item.
3. On confirmation, write the item into the target `context/` file, mark the proposal `promoted`, update `context/index.md`.
4. On rejection, mark it `rejected`; never record it.

## Rules and constraints

- Apply [execution principles](references/core/execution-principles.md), [isolation](references/core/isolation-policy.md), [traceability](references/core/traceability.md) and [approval](references/core/approval-policy.md).
- **Isolation is mandatory**: one project per activity; no reads outside the active project folder; no knowledge carried between projects.
- `context/` holds confirmed definitions only. Inferences, hypotheses and single-story decisions do not belong there unless the user confirms they are general rules of the system.
- A definition agreed for one user story is not automatically a system rule. Ask: "Is this a general rule of the system, or specific to this story?"
- Never record credentials, personal data or secrets. Record the name of the environment variable or secret instead.
- Keep files small and factual; each entry has a source and a confirmation date.
- Do not create, commit or push a private context repository unless asked.

## Validation criteria

- `project.json` validates against `schemas/project-context.schema.json` and `project` equals the folder name.
- Every entry in `context/` has a source and a confirmation date.
- `context/index.md` lists every context file with its last confirmed update.
- No path read or written outside `workspace/projects/<project-id>/` during the activity.
- No item in `context/` that is still `proposed` in `proposed-updates.md`.

## Output format

- Retrieval: a short summary in the conversation — project, files loaded, relevant gaps.
- Onboarding/update: files written under `workspace/projects/<project-id>/` (project.json, the context folder, proposed-updates.md), plus a summary of what changed.

## Human approval points

- Creating a new project folder (confirm the `project-id` and display name).
- A blank project's plan (`plan.json`) before any context file is created.
- Every promotion from `proposed-updates.md` to `context/`.
- Any change or removal of an existing confirmed entry.
- Setting `externalDataSharingAllowed` to `true`.

## Error handling

- Ambiguous project: ask; do not proceed.
- Project folder missing files or invalid `project.json`: report, offer to repair from the template without overwriting existing content.
- Contradiction between a new definition and confirmed context: show both with sources and ask which prevails; never overwrite silently.
- No file access: switch to the chat-only fallback.

## Completion criteria

- Retrieval: the next skill received the relevant context and the list of gaps.
- Onboarding: structure created, minimum context for the activity confirmed, `onboardingStatus` updated.
- Update: every presented proposal is promoted or rejected, and `context/index.md` is current.

## Persistence

All knowledge lives in `workspace/projects/<project-id>/` (project.json, the context folder, proposed-updates.md). Activity results never go there; they stay in `workspace/projects/<project-id>/runs/<run-id>/`. See the [persistence protocol](references/core/persistence-protocol.md).
