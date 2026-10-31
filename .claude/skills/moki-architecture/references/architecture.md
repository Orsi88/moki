# Architecture

A map, not the truth: verify every point in the files before relying on it.

## What Moki is

A portable, vendor-neutral library of QA skills (Agent Skills format), plus helper commands, the `qa` command and an Electron desktop app. Moki has **no AI of its own**. AI tools (Claude Code, Codex, Cursor, Gemini, chat tools) do the QA work by reading `AGENTS.md`, the agents and the `SKILL.md` files. Code exists only to scaffold, validate, render deliverables, show project files and open AI tools with a ready request. **QA behavior is text the AI follows, never code.**

## Layers

| # | Layer | Paths | Owns | Never |
|---|---|---|---|---|
| 1 | Content | `skills/<name>/` (`SKILL.md`, `references/`, `assets/`), `core/*.md`, `agents/<category>/<name>.md`, `agents/categories.json`, `templates/project-context/`, `schemas/`, `examples/`, `adapters/`, `docs/`, `AGENTS.md`, `README.md` + `README.pt-BR.md` | How activities are done, policies, roles, project template, data contracts | Project data; company-specific rules |
| 2 | Generated mirrors | `.agents/skills/`, `.claude/skills/`, `.claude/agents/` | What AI tools discover natively | Hand edits (rewritten by `npm run build`) |
| 3 | Build and validation | `scripts/build.mjs`, `validate.mjs`, `check-artifacts.mjs`, `check-secrets.mjs`, `check-output.mjs`, `.githooks/pre-commit`, `.github/workflows/ci.yml` | Mirrors, framework rules, repository hygiene, deterministic checks of AI deliverables | — |
| 4 | Helper commands | `scripts/new-project.mjs`, `new-run.mjs`, `runs.mjs`, `xlsx.mjs`, `docx.mjs`, `pdf.mjs`, `bundle.mjs`, `setup.mjs` | What skills and users run (`npm run …`) | QA decisions |
| 5 | Shared libraries | `scripts/lib/` | Logic reused by the CLI, the terminal menu, the desktop app, the validator and the build | Imports from `desktop/` or `app/` |
| 6 | `qa` command | `scripts/qa.ts`, `scripts/lib/terminal-menu.ts`, `scripts/lib/tui.ts` | Open the app, the terminal menu, or prepare a request directly | Own copy of request logic |
| 7 | Desktop main process | `desktop/` | Window, IPC, privileged operations, terminals, launching tools, installer sync | UI code |
| 7b | VS Code extension | `ide/vscode/` (`extension.ts`, `host.ts`, `webview-bridge.ts`), built by `scripts/build-vscode.mjs` | The same UI and service inside VS Code: webview panels, webview messages, AI tools in VS Code terminals | Own copy of service, launcher or note logic (imports `desktop/`) |
| 8 | UI | `app/src/` (React 19 + Vite) | Screens and components; `api.ts` is the only gateway to `window.qa` | Node APIs, file paths, network |
| 9 | Tests | `tests/framework.test.mjs`, `tests/desktop.test.ts`, `tests/i18n.test.ts`, `tests/ui/` (Playwright, `npm run test:ui`) | Regression safety | Starting real AI tools |
| 10 | Runtime data | `workspace/` (default), `workspaces/` | Projects, context, runs, user library | Ever being versioned |

Dependency direction: `app/` → (IPC) → `desktop/` → `scripts/lib/` → Node standard library; `ide/vscode/` → (webview messages from `app/`) → `desktop/`. `scripts/lib/` never imports `desktop/` or `app/`; `app/` never imports Node or `desktop/`.

## Shared libraries (`scripts/lib/`)

| File | Key exports |
|---|---|
| `repo.mjs` | `ROOT` (honors `QA_ROOT`), `workspaceDir`/`setWorkspaceDir`/`workspaceLabel` (honors `QA_WORKSPACE`), `MIRRORS`, `listSkillDirs`, `walkFiles`, `relPosix`, `toPosix`, `readJson`, `git`, `nowStamp`, `parseArgs`, `SLUG` |
| `core.ts` | `ACTIVITIES`, `TOOLS`, `LANGUAGES`, `STARTERS`, `isActivity`, `isTool`, `skillStatus`, `isUsable`, `listSkills`, projects, runs, tags, linked folder, installed skills and agents, `buildPrompt`, tool detection, clipboard |
| `agents.ts` | `Agent` model, `parseAgent`, `validateAgent` (shared by the validator and the app editor), `listAgents`, `listCategories`, `isUsableAgent`, `duplicateAgent`, `claudeSubagent` |
| `frontmatter.mjs` | Minimal YAML-subset parser (single-line values, one nested map) |
| `schema.mjs` | Minimal JSON Schema validator |
| `markdown.mjs` | Markdown → HTML with all HTML escaped (app and PDF) |
| `docx.ts`, `zip.mjs`, `numfmt.mjs`, `doc-style.mjs` | Dependency-free Word/zip/number-format/document-style support |

## Main flows

1. **Authoring → mirrors.** Edit `skills/`, `core/` or `agents/` → `npm run build` (`expectedFiles` in `scripts/build.mjs`: every skill into each of `MIRRORS`, `core/*.md` injected as `references/core/`; usable built-in agents → `.claude/agents/` via `claudeSubagent`; `claude-agents/*.md` copied unchanged) → `npm run validate` (`findDrift`) → pre-commit `build --check`.
2. **App request.** UI → `app/src/api.ts` → `window.qa.call` (`desktop/preload.ts`) → IPC `qa:call` → `desktop/main.ts` (`trusted()` = own `file://` page) → `callService` (`desktop/service.ts`: only names of service methods run) → `desktop/service.ts` method (validates inputs, `projectDir`, `inside` → `resolveInside`) → for `launch`: activity, tool and language from fixed lists, agent usable and enabled, files inside the project → `buildPrompt` (`scripts/lib/core.ts`) → `desktop/launcher.ts` (`launchInTerminal` or `launchTool`; prompt cleaned by `cleanPrompt` and passed as one argument).
3. **Other channels.** Only for what is not a request/response to the service: folder watching (`qa:watch`/`qa:changed`), terminal streams (`qa:term-*`), links and note windows. Every handler validates the caller (`trusted()`, or `fromNote()` for note windows) and each argument.
4. **CLI.** `qa` (no args) opens the app; `qa --terminal` runs the menu; `qa --project --activity --tool` builds the request with the same `buildPrompt`.
5. **AI execution.** The tool reads `AGENTS.md` → skill → `project-context` → `npm run new-run` creates the run and `state.json` (schema `schemas/execution-state.schema.json`) → outputs in the run folder → deliverables rendered by `npm run xlsx|docx|pdf` from `assets/*.layout.json` or the user's model → `npm run check-output` for deterministic checks.
6. **Installer.** `package.json` `build.extraResources` ships the framework into `resources/framework` → `desktop/boot.ts` → `syncFramework` (`desktop/framework.ts`) copies it to `Documents/Moki` (or `QA_ROOT`) once per build id and never touches `workspace/` or `workspaces/`.
7. **Workspaces.** `workspaceDir(root)` defaults to `<root>/workspace`; the app switches it with `setWorkspaceDir` and sets `QA_WORKSPACE` for the tools and helpers it starts (`desktop/workspaces.ts`, registry `workspaces/workspaces.json`).
8. **VS Code extension.** `moki.open` → `ide/vscode/host.ts` opens `app/dist` in a webview (its own CSP, `<base>`, `webview-bridge.ts` as `window.qa`) → webview message `call` → `callService` → the same service; `launch` → `launchInTerminal` with a VS Code terminal (`shellPath` + `shellArgs`, no shell); notes in their own tab (`desktop/notes.ts`). Installed, `ide/vscode/extension.ts` syncs the bundled framework into `frameworkTarget(<Documents>)`, the folder the desktop app uses.

## Desktop main process (`desktop/`)

| File | Role |
|---|---|
| `main.ts` | One window (plus note windows), single request channel `qa:call`, folder watcher, navigation and permission denial (the Content-Security-Policy is in `app/index.html`) |
| `preload.ts` | `window.qa`: `call`, `watch`, `onChanged`, `openLink`, `term`, note-window helpers. Nothing else from Electron or Node |
| `service.ts` | `createService(root, deps)`: every action the UI can ask for; validates every input; `ServiceError` for user-facing failures |
| `fs-guard.ts` | `resolveInside` (symlinks included), `OPENABLE_EXTENSIONS`, `EDITABLE_EXTENSIONS`, `OPEN_WITH_TYPES` |
| `pdfcraft.ts` | PDF comments and page edits through PdfCraft (`pdfcraft-cli run --script`, `--root` = project folder); the only writer of PDF bytes |
| `open-with.ts` | "Open with" for Excel, Word and PDF: the programs the system offers (Linux GIO, macOS Launch Services via JXA, Windows its own dialog) and opening with one; never changes the system default (the program kept per type is a UI preference) |
| `launcher.ts`, `run-tool.ts`, `terminals.ts` | Start AI tools from the fixed `TOOLS` list: terminal tab (node-pty), external terminal (Windows: UTF-8 JSON request file read by `run-tool.ts`; macOS/Linux: single-quoted bash script), editors with the request on the clipboard |
| `skill-registry.ts` | SkillMD registry search and install, sha256 per file, writes only inside the chosen skills folder |
| `search.ts`, `workspaces.ts` | Workspace search; workspace registry |
| `framework.ts`, `boot.ts` | Installer sync; `PATH` from the login shell on macOS/Linux |

`deps` injected into `createService` (`launch`, `openFolder`, `openPath`, `appChooser`, `pdfcraft`, `pickFolder`, `home`, `fetch`, `trash`, `onWorkspace`) are the test seams: `tests/desktop.test.ts` runs the service without Electron and never starts real tools.

## Extension points — extend these instead of adding branches

| Table or list | File | Extend to add |
|---|---|---|
| `REQUIRED_SECTIONS`, `STATUSES`, `ALLOWED_KEYS`, `OUTPUT_PATH_PREFIXES` | `scripts/validate.mjs` | Skill-standard rules (deliberate, documented in `docs/skill-standard.md`) |
| `AGENT_SECTIONS`, `ACCESS_LEVELS`, `AGENT_KEYS` | `scripts/lib/agents.ts` | Agent rules |
| `ACTIVITIES` (+ `ActivityKey`, `buildPrompt` case), `TOOLS` (+ `ToolKey`), `LANGUAGES`, `STARTERS` | `scripts/lib/core.ts` | App and menu activities, AI tools, deliverable languages |
| `MIRRORS`; `GENERATED` | `scripts/lib/repo.mjs`; `scripts/build.mjs` | Tool discovery folders |
| `ALLOWED_ROOT_FILES`, `ALLOWED_ROOT_DIRS`, `BINARY_ALLOWED`; `PATTERNS` | `scripts/check-artifacts.mjs`; `scripts/check-secrets.mjs` | Versioned locations; secret formats |
| `OPENABLE_EXTENSIONS`, `EDITABLE_EXTENSIONS`, `OPEN_WITH_TYPES` | `desktop/fs-guard.ts` | File types (security-relevant) |
| Methods of the object returned by `createService` | `desktop/service.ts` | UI actions (exposed automatically through `callService`, in the desktop app and the VS Code extension) |
| `assets/*.layout.json` | `skills/<name>/assets/` | Spreadsheet deliverable layouts |
| Workflow files (` ```json workflow ` block) | `skills/qa-orchestrator/references/workflows/` | Chains of skills with gates |
| `agents/categories.json` | `agents/` | Agent categories |
| `build.extraResources`, `asarUnpack` | `package.json` | Files shipped with the installer |

## Technical constraints

- **Node ≥ 22.18** runs `.ts` directly (type stripping): erasable syntax only (`erasableSyntaxOnly`: no `enum`, `namespace`, parameter properties), relative imports with the `.ts` extension, `import type` for types (`verbatimModuleSyntax`).
- **No runtime dependencies.** `package.json` has only devDependencies plus the optional `node-pty`. xlsx, docx, zip, Markdown and schema support are hand-written on purpose.
- **ESM everywhere** (`"type": "module"`); the preload is bundled to `preload.cjs` by esbuild (`scripts/build-desktop.mjs`).
- **Two TypeScript projects:** root `tsconfig.json` (scripts, desktop, tests; NodeNext, `noUnusedLocals`) and `app/tsconfig.json` (bundler, DOM, `noUnusedParameters`). `npm run typecheck` runs both.
- **UI text:** English source wrapped in `t()`; `app/src/i18n/pt-BR.json` must have every `t('…')` key plus every `ACTIVITIES` label and hint and every `LANGUAGES` entry (`tests/i18n.test.ts`). Translate while rendering, never in module constants (`app/src/i18n.ts`).
- **Limits:** `SKILL.md` ≤ 500 lines; descriptions ≤ 1024 characters; `AGENTS.md` ≤ 32 KB (Codex default).
- **Portability:** skills use only the portable Agent Skills frontmatter keys and plain imperative English, no tool-specific syntax.
- **Platforms:** Windows, macOS and Linux. Paths are built with `join`, stored with `/` (`relPosix`, `toPosix`); user text never goes into a shell command line.

## Checks and where they run

| Check | Command | Pre-commit | CI |
|---|---|---|---|
| Types | `npm run typecheck` | — | ✔ |
| App build | `npm run app:build` | — | ✔ |
| Framework rules, links, schemas, mirrors | `npm run validate` | — | ✔ |
| Mirrors only | `node scripts/build.mjs --check` | ✔ | (in validate) |
| Versioned paths | `node scripts/check-artifacts.mjs` (staged) / `--all` (tracked) | ✔ | ✔ |
| Secrets | `node scripts/check-secrets.mjs` (staged) / `--all` | ✔ | ✔ |
| Tests | `npm test` (`node --test`) | — | ✔ |
| UI end to end | `npm run test:ui` | — | — |

`npm run check` = validate + `check-artifacts --all` + `check-secrets --all`. `--all` reads `git ls-files`: **new untracked files are not covered** until staged — pass them explicitly (`node scripts/check-artifacts.mjs <paths>`).
