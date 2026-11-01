# Automated tests

What is tested in Moki, how, where it runs and how to add a test. All tests live in `tests/`. Every scenario, one row each: [Test catalog](test-catalog.md) (`npm run test-catalog` regenerates it from the test files).

## At a glance

| Suite | Runner | Files | Test cases | Runs in CI |
|---|---|---|---|---|
| Unit and integration | `node --test` (Node's built-in runner, TypeScript run directly) | 10 files in `tests/` | 123 | Yes (`npm test`) |
| Interface (end to end) | Playwright driving the Electron app | `tests/ui/app.spec.ts` | 21 | **No** |
| Repository checks | `scripts/validate.mjs`, `check-artifacts.mjs`, `check-secrets.mjs` | — | — | Yes (`npm run check`) |
| Type check | `tsc` for the desktop/CLI code and for the app | — | — | Yes (`npm run typecheck`) |

```bash
npm test          # unit and integration
npm run test:ui   # builds the desktop app, then the interface tests
npm run check     # validation, run artifacts, secrets
npm run typecheck
```

Run them from a terminal **without** `QA_ROOT`, `QA_MCP_SERVER` or `QA_RUN_TOOL` set (the installed app and the VS Code extension set them): with `QA_ROOT`, tests and checks read the installed copy in `Documents/Moki` instead of the checkout. `unset QA_ROOT QA_MCP_SERVER QA_RUN_TOOL` first.

## The three kinds

- **Unit** tests call one function with inputs built in the test: parsers, formats, rules, rendering, link rewriting. No app, no process.
- **Integration** tests run real modules together on real files in a temporary workspace: the desktop service (`createService`) with fake launchers, the IDE panel's API, Moki's MCP server over stdio, the validator on the real repository, the installer's framework sync.
- **Interface** tests open the real Electron window (`app/` + `desktop/`) on a temporary workspace and click through it, in Portuguese, with the AI tools faked.

## Unit and integration tests (`node --test`)

| File | Kind | Area | Cases | What it covers |
|---|---|---|---|---|
| `framework.test.mjs` | Unit + integration | Framework | 17 | The validator on the real repository and on a fixture (structure, workflows, mirrors and drift), frontmatter, subagent generation, artifact and secret checks, the run-state schema, xlsx and docx generation and filling, output checks, the `qa` assistant (activities, prompts, inbox copies), Markdown rendering |
| `desktop.test.ts` | Integration (+ some unit) | Desktop service | 61 | Projects (create, delete, tree, read and edit files, inbox drops, notes), file confinement (`fs-guard`), "open with" and PdfCraft, launching AI tools (choices checked against fixed lists, request building, Word extraction, UTF-8 on Windows, no shell), tags, agents and the agent library, multi-agent operations (definitions, runs, branching and loops, failures and retries, rejection, answers, cancelling), skills (registry, creation, set up, global), linked folders and repository writes, Markdown/docx/spreadsheet rendering, installer sync, the UI request bridge, note windows, workspaces, search |
| `companion.test.ts` | Integration | IDE: context and MCP server | 8 | How a folder finds its project, which resources the AI may read (shared context waits, secrets never), isolation between projects, context modes and the context pack, the MCP protocol (initialize, tools, logging), a session bound to one project, the server over stdio |
| `companion-api.test.ts` | Integration | IDE: panel API | 9 | Only the panel's calls exist, state, agents, context switches, launching Claude Code with `--mcp-config`, copying for the chat, *Connect Claude Code*, no project, operations from the panel |
| `mcp.test.ts` | Unit + integration | MCP servers | 14 | The catalog (ids, credentials as `${VARIABLE}` only, where a server applies), what an agent gets, importing configurations, Claude Code and Cursor configurations and merging, variables at start, launches with `--mcp-config`, Cursor sync, the service and its test results, a run keeping its servers, what the IDE lists, probing a real stdio server |
| `tags.test.ts` | Unit | Tags | 3 | The one rule (no tag = every project) and the migrations of agents and document templates to tags |
| `usage.test.ts` | Unit | Status bar | 4 | Claude and Codex plan windows, memory per terminal and per project |
| `i18n.test.ts` | Unit (static) | Translations | 2 | Every text of the app has a pt-BR translation that keeps its `{placeholders}` |
| `icon-font.test.mjs` | Unit | IDE icon | 2 | The status bar cat glyph and the SVG path flattening |
| `wiki.test.mjs` | Unit | Documentation | 3 | The wiki built from `docs/`: every page, links rewritten, the in-development note, broken links stop it |

Two tests in `desktop.test.ts` are skipped on Windows (*app plugins load only in app sessions* and *terminal tabs start only the chosen tool…*): they check POSIX command lines and run in CI on Linux.

### How they are written

- **One temporary workspace per file.** `desktop.test.ts` creates one folder (`mkdtemp`) with the framework copied in, one service for the file, and removes it at the end; tests add what they need and clean it up. Operations tests create their own service with fake dependencies.
- **Fakes, not mocks of modules.** The service takes its effects as dependencies (`launch`, `openFolder`, `detectTools`, `killTerminal`, `terminalAlive`, `writeTerminal`, `fetch`, `pickFolder`…); tests pass functions that record what was asked.
- **Titles say the behaviour**, as a sentence a reader can check: *"operations: a step whose AI tool cannot open fails once (no retry loop) and is tried again with another AI"*.
- **Real processes where it matters:** Moki's MCP server over stdio, a real stdio MCP server for the probe.

## Interface tests (`tests/ui/app.spec.ts`)

Playwright opens the built Electron app (`npm run test:ui` builds it first). Each `describe` block gets its own temporary workspace and user profile, and its tests run in order on the same window (`workers: 1`).

| Block | Tests | What it covers |
|---|---|---|
| Moki settings | 8 | Document templates (layout, logo, watermark, per-project templates), *Create skill*, an agent's contract and your copy of it, your own agent, the operation editor (cards, arrows, approval, input mapping) |
| Moki tags | 1 | A project tag brings another project into the activity context |
| Moki workspaces | 3 | The workspace picker, deleting a hidden project, loose notes and the notebook window |
| Moki project tree | 5 | Copying a path, creating files and folders, slash commands and checklists in notes, favourite notes, project notes in the notebook |
| Moki operations in a project | 2 | Starting an operation from its form and following it on the board (states, rejecting with a reason, answering a question, approving, the list view); results choosing arrows, loops, the user's decision |
| Moki terminals outlive the project screen | 1 | Leaving a project keeps its terminal; coming back restores the tab and its output |
| Moki MCP servers list | 1 | The Global switch, the project picker, the chips and removing a project |

### How they are written

- `fixture()` copies `skills/`, `agents/` and `templates/` to a temporary folder and adds the project `acme` (*Acme Library*); `addProject()` adds more.
- `openApp()` starts the app in Portuguese on a project, with its own profile (`QA_USER_DATA`), so it never touches the app you have open.
- `QA_FAKE_TOOLS=1` makes every AI tool look installed and starts nothing; tests write what an agent would deliver (outputs, handoff, a question) and check that the window follows.
- Locators use roles and accessible names (`getByRole('button', { name: '…' })`), the Portuguese texts the person sees.

## Adding a test

| You changed | Add |
|---|---|
| A function with no effects (parser, format, rule) | A unit test in the file of its area |
| Something the desktop service does | An integration test in `desktop.test.ts` (or `mcp.test.ts`, `companion*.test.ts` for those areas) with a fake for each effect |
| What the person sees or clicks | An interface test in `tests/ui/app.spec.ts`, in the block of its screen |
| A text of the app | A pt-BR translation (`i18n.test.ts` fails without it) |

Before a commit: `npm run typecheck`, `npm run check`, `npm test`, and `npm run test:ui` when the window changed.

## What has no automated test

| Part | Why it matters | Covered today by |
|---|---|---|
| The desktop main process wiring (`desktop/main.ts`: IPC handlers, the terminal exit hook) | It connects the window, the terminals and the service | Indirectly, by the interface tests |
| The VS Code extension host (`ide/vscode/host.ts`, `extension.ts`) and its panel (`app/src/companion/`) | Project detection, MCP registration, terminals and operations in the IDE | The panel's API (`companion-api.test.ts`) only |
| Terminal output kept for a returning tab (`desktop/terminals.ts`) | Terminals outliving the project screen | One interface test |
| The CLI helpers (`new-project`, `new-run`, `runs`) and the terminal menu (`qa --terminal`) | Documented commands for AI tools and people | Not tested |
| The interface tests in CI | 21 tests that only run when someone runs them | Not in CI |
| Coverage | Knowing what the tests miss | Not measured |
