# Business rules and invariants

The domain rules of the framework and what no change may break. Each rule names where it is enforced; a rule enforced only by text (a policy the AI follows) is just as binding as one enforced by code.

## Domain model

### Skill — *how* an activity is done

- Lives in `skills/<name>/`: `SKILL.md`, optional `references/` (loaded only when a step needs them), `assets/`, `scripts/`. Folder name = `name` (`SLUG`, ≤ 64 characters). *validate*
- Frontmatter: only `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`; single-line values; description ≤ 1024 characters; `metadata.version` semver; optional `metadata.category` slug. *validate*
- Status (`metadata.status`): `stable` and `draft` are usable; `pending-migration` and `planned` are not, and their descriptions start with `[PENDING MIGRATION]` / `[PLANNED]` so tools that read only descriptions do not run them. Usable skills need `examples/<name>/`. `isUsable()` in `scripts/lib/core.ts` gates the app and the `qa` command. *validate, core.ts*
- `SKILL.md` ≤ 500 lines with the 13 `##` sections of `REQUIRED_SECTIONS` (Purpose … Persistence). *validate*
- Backticked paths in `## Output format` and `## Persistence` start with `workspace/projects/<project-id>/`, `<target-repo>/`, `references/` or `assets/`. *validate*
- Links stay inside the skill folder (skills are distributed standalone); core policies are linked as `references/core/<file>.md` and injected by the build. *validate, build*
- Every skill is listed in `AGENTS.md`. *validate*
- Step ids are recorded in `state.json`: renaming a step breaks resuming existing runs.
- Fixed user-facing phrases (gate questions, the failure-analysis missing-information message, `[PRE-ANALYSIS]` labels, review-matrix values) are checked by `scripts/check-output.mjs` and exercised by `examples/`: they change together or not at all.
- No company- or application-specific rule in a skill: that belongs to the project context.

### Agent — *who* does it

- Role + instructions + the skills it uses + the access it asks for. An agent never replaces a skill: its "How to work" sends the AI to its skills. (`docs/agents.md`)
- Built-in: `agents/<category>/<name>.md`, `name` = file name, `category` = folder and defined in `agents/categories.json`, at least one existing skill, sections Role, When to use, How to work, Boundaries. `validateAgent` in `scripts/lib/agents.ts` is shared by the validator and the app editor. Every built-in agent is listed in `AGENTS.md`. *validate*
- Access levels (`ACCESS_LEVELS`): `read-only` (reads, writes nothing), `project-write` (only inside `workspace/projects/<project-id>/`), `repository-write` (may also change a linked repository, after an approved plan). They are instructions to the AI; in Claude Code, `read-only` agents are generated without the editing tools (`claudeSubagent`).
- Only usable built-in agents become Claude Code subagents in `.claude/agents/`. *build*
- Built-in agents are read-only in the app; the user's own agents live in `workspace/library/agents/<category>/` and can never shadow a built-in name (`listAgents`). A copy records `metadata.basedOn`.
- Per project, `project.json` `agents` lists the enabled agents (absent = every usable agent); a launch with an agent requires it to be usable and enabled. *service.ts*

### Project, run, workflow

- Project = `workspace/projects/<project-id>/`: `project.json` (required `schemaVersion`, `project`, `name`; schema `schemas/project-context.schema.json`), `context/` (confirmed knowledge only), `proposed-updates.md` (unconfirmed, never treated as fact), `activity-log.md`, `inbox/`, `runs/`, `temporary/`, `tags.json`. Starters: `qa` (template context files) or `blank` (planned with the AI). Template: `templates/project-context/`.
- Run id `YYYYMMDD-HHMM-<skill-or-workflow>-<slug>`; `state.json` per `schemas/execution-state.schema.json`; statuses `in-progress`, `awaiting-approval`, `awaiting-input`, `blocked`, `completed`, `cancelled`; resume from `currentStep`. `npm run runs` checks that `project` and artifacts stay inside the run's project.
- Workflow: ` ```json workflow ` block in `skills/qa-orchestrator/references/workflows/<id>.md`; `id` = file name; known skills; `dependsOn` only earlier steps; gates `none`, `approval`, `input`. *validate + schema*

### Workspace, tags, linked folder, installed items

- Workspace: `workspace/` is the default; others live under `workspaces/` or where the user chose, listed in `workspaces/workspaces.json`. Only the active workspace exists for an activity. Code resolves it through `workspaceDir()`; tools started by the app get `QA_WORKSPACE`.
- Tags (`workspace/tags.json`, `project.json` `tags`, `<project>/tags.json`) share confirmed context between projects of one workspace, read-only, only the files the request lists; never across workspaces.
- Linked folder: `repositories[]` entry with `linkedFolder: true`; linking backs up the folder's AI settings to `.moki-backup/link-<date>/` inside it and adds that folder to `.git/info/exclude`. Every install, agent or removal in its `.claude` asks for confirmation and backs up first; `writeAllowed: false` refuses.
- MCP servers (`scripts/lib/mcp.ts`, `docs/mcp-servers.md`): one list per workspace (`workspace/mcp-servers.json`); each server is global (`projects: []`, every project) or for the projects it lists, and can be switched off (`enabled: false`) without being deleted. Ids are stable and unique in the list; agents name them in `mcps`. Values are `${VARIABLE}` references only, resolved when a server starts; literal credentials are refused. An agent or operation step gets only the servers its contract names that the project has on; a run keeps the definitions it started with. Moki writes only its own `moki`/`moki-*` entries in a tool's file, and in the linked folder only after confirmation (`writeAllowed: false` refuses).
- Installed skills and agents: per project (`<linked folder>/.claude/{skills,agents}` or `workspace/projects/<id>/{skills,agents}`) or global (`~/.claude/skills`, `~/.agents/skills`, `~/.claude/agents`). Names are accepted only from the service's own listings; removal goes to the system trash; registry installs verify each file's sha256 and write only inside the target folder.

## Policies (`core/`, injected into every skill)

| Policy | Core rule |
|---|---|
| `isolation-policy.md` | One project per activity; never read other projects (except listed shared context); never write generated content into framework folders; workspace never versioned; no secrets; synthetic examples |
| `approval-policy.md` | Stop at gates; never perform the dependent step in the same response; only explicit approval counts; modifying a target repository needs approval |
| `persistence-protocol.md` | No shared memory; continuity only through `state.json` and context files |
| `traceability.md` | Never fabricate ids; provisional ids use `TMP-`; inferred rules need approval |
| `execution-principles.md` | No invention; hypotheses labeled; context precedence user > confirmed project context > framework; max 3 retries; language rules |

Language: framework files and skills in English; conversation in the user's language; deliverables in the language asked for, else the project's `deliverableLanguage`, else English; app UI in English and pt-BR.

## Invariants — never break

**Data isolation**
1. Nothing from `workspace/` or `workspaces/` is versioned (`.gitignore` and `check-artifacts`, which also blocks `dist/`, `build/`, `release/`, `.env*`, logs and binaries outside skill assets, app artwork and `docs/assets/`).
2. Skills write only inside one project folder or an authorized target repository.
3. `examples/` is synthetic; no secrets anywhere (`check-secrets`; the `qa-agents:allow-secret` marker is only for documented fake values).

**Generated content**
4. Mirrors change only through `npm run build`; drift fails validate, the pre-commit hook and CI.

**Portability**
5. Skills stay vendor-neutral and self-contained; `CLAUDE.md` only imports `AGENTS.md`; `AGENTS.md` ≤ 32 KB.

**Desktop security** (`docs/desktop-app.md` § Security model)
6. Renderer: `contextIsolation`, `sandbox`, no `nodeIntegration`, CSP, no navigation or new windows (web links go to the browser), every permission request denied.
7. One request channel `qa:call`, accepted only from the app's own page and only for service method names; every other channel validates caller and arguments.
8. Every service input is validated: project ids from `listProjects`; paths through `resolveInside` (symlinks included); activities, tools and languages from the fixed lists; agents usable and enabled; folder paths only from the native dialog (`pickFolder`), never from the UI; skill and agent names only from the service's listings.
9. Editing only for existing `.md` and `.txt` files; opening with the default program only for `OPENABLE_EXTENSIONS`, never executables or scripts; "Open with" only for `OPEN_WITH_TYPES` (a subset), with a program from the system's own list, and the system default is never changed.
10. User text reaches AI tools only as the prompt argument (`cleanPrompt`; UTF-8 file on Windows; single-quoted on macOS/Linux) — never inside a shell command line.
11. Markdown is rendered with all HTML escaped, attribute quotes included.
12. Built-in agents cannot be edited or deleted from the app; custom ones are validated before saving.

**Installer**
13. `syncFramework` never touches `workspace/` or `workspaces/`.

**Truthfulness and approval**
14. Gates stop the response; nothing is invented; a check that was not run is never reported as passed.

**Compatibility**
15. Existing user data keeps working: older `project.json`, `state.json` and custom agents may lack new fields — readers default them, schemas add optional fields, and a required field comes with a migration plan.
16. `README.md` and `README.pt-BR.md` change together.
