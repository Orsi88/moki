# Automated tests

What is tested in Moki, how, where it runs and how to add a test. All tests live in `tests/`. Every scenario, one row each, with the totals per kind and per area: [Test catalog](test-catalog.md) (`npm run test-catalog` regenerates it from the test files).

## At a glance

| Suite | Runner | Where | Runs in CI |
|---|---|---|---|
| Unit and integration | `node --test` (Node's built-in runner, TypeScript run directly) | `tests/*.test.ts`, `tests/*.test.mjs` | Yes (`npm test`) |
| Interface (end to end) | Playwright driving the Electron app, headless | `tests/ui/*.spec.ts` | **No** |
| Memory and load | `tests/perf/measure-memory.mjs` driving the Electron app, headless | `tests/perf/` | **No** |
| Repository checks | `scripts/validate.mjs`, `check-artifacts.mjs`, `check-secrets.mjs` | — | Yes (`npm run check`) |
| Type check | `tsc` for the desktop/CLI code and for the app | — | Yes (`npm run typecheck`) |

```bash
npm test          # unit and integration
npm run test:ui   # builds the desktop app, then the interface tests (always headless)
npm run measure:memory -- --label baseline   # memory and load battery (needs npm run app:build)
npm run check     # validation, run artifacts, secrets
npm run typecheck
```

Run them from a terminal **without** `QA_ROOT`, `QA_MCP_SERVER` or `QA_RUN_TOOL` set (the installed app and the VS Code extension set them): with `QA_ROOT`, tests, checks and the pre-commit hook read the installed copy in `Documents/Moki` instead of the checkout. `unset QA_ROOT QA_MCP_SERVER QA_RUN_TOOL` first.

## The three kinds

- **Unit** tests call one function with inputs built in the test: parsers, formats, rules, rendering, link rewriting. No app, no process.
- **Integration** tests run real modules together on real files in a temporary workspace: the desktop service (`createService`) with fake launchers, the IDE panel's API, Moki's MCP server over stdio, the validator on the real repository, the installer's framework sync.
- **Interface** tests open the real Electron window (`app/` + `desktop/`) on a temporary workspace and click through it, in Portuguese, with the AI tools faked.

## Unit and integration tests (`node --test`)

| File | Kind | What it covers |
|---|---|---|
| `framework.test.mjs` | Unit + integration | The validator on the real repository and on a fixture (structure, workflows, mirrors and drift), frontmatter, subagent generation, artifact and secret checks, the run-state schema, xlsx and docx generation and filling, output checks, the `qa` assistant (activities, prompts, inbox copies), Markdown rendering |
| `desktop.test.ts` | Integration (+ some unit) | Projects (create, delete, tree, read and edit files, inbox drops, notes), file confinement (`fs-guard`), "open with" and PdfCraft, launching AI tools (choices checked against fixed lists, request building, Word extraction, UTF-8 on Windows, no shell), tags, agents and the agent library, multi-agent operations (definitions, runs, branching and loops, failures and retries, rejection, answers, cancelling), skills (registry, creation, set up, global), linked folders and repository writes, Markdown/docx/spreadsheet rendering, installer sync, the UI request bridge, note windows, workspaces, search |
| `companion.test.ts` | Integration | How a folder finds its project, which resources the AI may read (shared context waits, secrets never), isolation between projects, context modes and the context pack, the MCP protocol (initialize, tools, logging), a session bound to one project, the server over stdio |
| `companion-api.test.ts` | Integration | Only the panel's calls exist, state, agents, context switches, launching Claude Code with `--mcp-config`, copying for the chat, *Connect Claude Code*, no project, operations from the panel |
| `mcp.test.ts` | Unit + integration | The catalog (ids, credentials as `${VARIABLE}` only, where a server applies), what an agent gets, importing configurations, Claude Code and Cursor configurations and merging, variables at start, launches with `--mcp-config`, Cursor sync, the service and its test results, a run keeping its servers, what the IDE lists, probing a real stdio server |
| `activities.test.ts` | Unit + integration | Activities: the list of the app's actions, the ones of Moki and your own, the request text, file checks, tags and favorites, and through the service: creating, duplicating, deleting and launching (a skill, an agent or an operation) |
| `favorites.test.ts` | Unit + integration | Favorites of the workspace: one list per kind (activities, agents, operations, templates, skills), their order, safe ids and the service |
| `pdf-local.test.ts` | Unit | Comments in a PDF without PdfCraft: highlights, comments, replies, edits and deletes written by Moki itself |
| `md-comments.test.ts` | Unit | Comments kept inside a Markdown file (invisible to other viewers), replies, edits and deletes |
| `md-preserve.test.ts` | Unit | The formatted editor rewrites only the edited stretch of a Markdown file: Windows line endings and the original spacing stay |
| `tool-path.test.ts` | Unit | Finding the AI tools from the installed app: the PATH it builds from the terminal's and the usual install folders |
| `tags.test.ts` | Unit | The one rule (no tag = every project) and the migrations of agents and document templates to tags |
| `usage.test.ts` | Unit | Claude and Codex plan windows, memory per terminal and per project |
| `i18n.test.ts` | Unit (static) | Every text of the app has a pt-BR translation that keeps its `{placeholders}` |
| `icon-font.test.mjs` | Unit | The status bar cat glyph and the SVG path flattening |
| `wiki.test.mjs` | Unit | The wiki built from `docs/`: every page, links rewritten, the in-development note, broken links stop it |

Two tests in `desktop.test.ts` are skipped on Windows (*app plugins load only in app sessions* and *terminal tabs start only the chosen tool…*): they check POSIX command lines and run in CI on Linux.

### How they are written

- **One temporary workspace per file.** `desktop.test.ts` creates one folder (`mkdtemp`) with the framework copied in, one service for the file, and removes it at the end; tests add what they need and clean it up. Operations tests create their own service with fake dependencies.
- **Fakes, not mocks of modules.** The service takes its effects as dependencies (`launch`, `openFolder`, `detectTools`, `killTerminal`, `terminalAlive`, `writeTerminal`, `fetch`, `pickFolder`…); tests pass functions that record what was asked.
- **Titles say the behaviour**, as a sentence a reader can check: *"operations: a step whose AI tool cannot open fails once (no retry loop) and is tried again with another AI"*.
- **Real processes where it matters:** Moki's MCP server over stdio, a real stdio MCP server for the probe.

## Interface tests (`tests/ui/app.spec.ts`)

Playwright opens the built Electron app (`npm run test:ui` builds it first). Each `describe` block gets its own temporary workspace and user profile, and its tests run in order on the same window (`workers: 1`).

| Block | What it covers |
|---|---|
| Moki settings | The Settings lists (Agents, Operations, Skills, MCP servers, Templates), document templates (layout, logo, watermark, per-project templates), skills and *Add a skill*, an agent's page and your copy of it, the operation editor (cards, arrows, approval, input mapping) |
| Moki tags | A project tag brings another project into the activity context |
| Moki workspaces | The workspace picker, deleting a hidden project, loose notes and the notebook window |
| Moki project tree | Copying a path, creating files and folders, slash commands and checklists in notes, favourite notes, project notes in the notebook |
| Moki operations in a project | Starting an operation from its form and following it on the board (states, rejecting with a reason, answering a question, approving, the list view); results choosing arrows, loops, the user's decision |
| Moki terminals outlive the project screen | Leaving a project keeps its terminal; coming back restores the tab and its output |
| Moki MCP servers list | The Global switch, the project picker, the chips and removing a project |
| Moki activities | Creating an activity in Settings, starring it, and finding it first when opening the AI tool |
| Moki favorites | The star on the cards of Agents, Operations, Templates and Skills, and favorites first |
| Moki settings without a project | In a workspace with no project, Skills shows its list and without a project only the upload adds skills (for every project) |
| Moki PDF comments | Commenting a selection on a PDF page and in a Markdown file |

### How they are written

- `fixture()` copies `skills/`, `agents/` and `templates/` to a temporary folder and adds the project `acme` (*Acme Library*); `addProject()` adds more.
- `openApp()` starts the app in Portuguese on a project, with its own profile (`QA_USER_DATA`), so it never touches the app you have open.
- `QA_FAKE_TOOLS=1` makes every AI tool look installed and starts nothing; tests write what an agent would deliver (outputs, handoff, a question) and check that the window follows.
- Locators use roles and accessible names (`getByRole('button', { name: '…' })`), the Portuguese texts the person sees.

### Always headless

The interface tests never put a window on your screen. Electron has no headless mode, so on Linux `npm run test:ui` runs Playwright inside a virtual X display (`xvfb-run`, from the `xvfb` / `xorg-x11-server-Xvfb` package): without `xvfb-run` it stops with an error and never falls back to your real display. On Windows and macOS it runs directly with `QA_UI_HEADLESS=1`. Every test opens the app through `launchMoki()` in `tests/ui/launch.ts`, which refuses to start unless `QA_UI_HEADLESS=1` and, on Linux, `DISPLAY` is the virtual one and `WAYLAND_DISPLAY` is unset; it also clears `PWDEBUG` and asks Electron for the X11 backend. Do not call `electron.launch` in a spec, and do not run `playwright test` directly (it stops at the first launch). Pass Playwright options after `--`, for example `npm run test:ui -- -g "PDF comments"`.

## Memory and load battery

`npm run measure:memory -- --label <name>` (after `npm run app:build`) opens the built app on a temporary workspace, headless like the interface tests, and runs fourteen scenarios three times each: S0 idle with a project, S1 no project, S2 a 25 MB PDF (open, scroll, close), S3 the PDF three times (leak), S4 the PDF open while 20 files change, S5 three terminals with heavy output, S6 a tree of 20,000 files (open, search), S7 Markdown with 3 Excalidraw and 3 Mermaid diagrams, S8 several windows, S9 sixty seconds of status-bar polling with three terminals, S11 a 300-page light PDF (open, scroll to the end, close), S12 a burst of 200 files in `runs/` over about 20 s with three Markdown tabs open (one with 5 images, one with a Mermaid and an Excalidraw diagram), S13 typing in a 300 KB note and in a 300 KB `.md` (3 images each) with a 2,000-row tree expanded, and S-floor, a bare Electron on `about:blank` with nothing of Moki (`tests/perf/floor-main.mjs`, no app build needed), which measures the cost of Electron itself so every other number can be read as floor plus Moki. The window is 1360×860. All data (the PDF, made with `pdf-lib` from a fixed seed, and the tree) lives in the system temporary folder and is deleted afterwards.

Per scenario it reports, as the median of the repetitions with the spread (CV): peak and settled memory of the whole process tree (PSS from `/proc` on Linux, Electron's working set elsewhere), the renderer's share, open time and the main process's CPU in seconds (`cpu_main_s`, the CPU time of the main process during the scenario's window; an absolute value, because a percentage rises when a window gets shorter even if the work did not grow). A report made before `cpu_main_s` existed only has `cpu_main_pct`: `compare` shows `n/d` for that metric instead of failing. The table is printed and saved to `build/memory/<name>-<date>.json` (`build/` is not versioned). A scenario that cannot run (for example no `node-pty`) is marked FAILED, never filled with numbers.

**By process type, RSS, PSS and USS.** On Linux every scenario also records, per process type (`browser` = main, `renderer`, `gpu`, `utility` = network service and other helpers, `zygote`, `other` = anything in the tree that is not an Electron process, such as a terminal's shell) and in total, the RSS, PSS and USS in MB (`by_type` in the JSON, per repetition, and flat `bt_<type>_<rss|pss|uss>_mb` keys that get the median and CV like any other metric). RSS counts a shared page in full in every process that maps it (it is what the status bar summed, the `workingSetSize` of `app.getAppMetrics()`), PSS splits it between those processes (the sum is the real footprint), USS is only the private pages (`Private_Clean` + `Private_Dirty`, what would be freed if the process exited). The JSON also has `bar_rss_mb` (the sum of the working sets, what the bar showed), `pss_metrics_mb` (PSS of the same processes), `rss_pss_ratio` (the first over the second: how much the bar inflated the number) and `app_metrics` (each process with `workingSetSize`, `privateBytes` and `sharedBytes` as Electron reports them, in kB; the last two may be empty on Linux). Elsewhere only the working set is available, so the PSS and USS fields are absent.

```bash
npm run measure:memory -- --label baseline          # before a change
npm run measure:memory -- --label after-1a          # after it
npm run measure:memory -- compare build/memory/baseline-<date>.json build/memory/after-1a-<date>.json [--goal c1,c2,c3,c5,perf]
QA_PERF=1 npm run measure:memory -- --label after-1a --only S6,S11,S12,S13   # the new scenarios, with the main-process probe
npm run measure:memory -- --label floor --only S-floor --reps 5           # the floor alone: no app build needed
```

`compare` prints the change in MB and in % and PASS/FAIL per metric: no memory metric may be worse than `max(5%, 2×CV)` of the baseline, no open time more than `max(15%, 2×CV)`, the first Excalidraw render at most 400 ms more; `--goal` adds the goals of a batch of tasks (c1 diagrams, c2 status-bar polling at least -80% CPU, c3 PDF peak at most 60% and no PDF re-sent on file changes, c5 renderer with full terminals at least -30%, perf the absolute goals below). After the table it prints, for information only (it never changes a verdict), the by-type breakdown: RSS, PSS and USS per process type, baseline against after, in MB and %, and the status-bar RSS/PSS ratio of each scenario. It exits with 1 when something fails. Options: `--reps`, `--only S2,S5` (`S-floor` is an id like the others), `--s9-seconds`, `--matrix` (below). S11, S12, S13 and the loop lag of S6 are new and no one has run them yet: expect to adjust them, and the thresholds below, after the first real measurement.

**Main-process probe (`QA_PERF=1`).** Opt-in: `tests/perf/main-hook.mjs` is injected into the main process after the window is up (through the same channel the harness already uses; `desktop/` is not touched) and adds to every scenario `loop_lag_max_ms` (largest delay of a 20 ms timer in the main process), `ipc_calls_total`, `ipc_bytes` (what the calls return: characters of strings and bytes of buffers) and `exec_file_sync_calls`, plus the calls per method (`ipc_by_method`, printed after the table). S6 reports the lag of the two searches only; S12 needs the probe and fails without it. Limits: it reads Electron's private handler map (`ipcMain._invokeHandlers`), so another Electron version can hide it; it counts only the `qa:call` channel (not terminals, watch or note windows); and it sees nothing that ran before the injection, such as the shell lookup at start-up. `ipc_bytes` is an estimate of the size, not of what Electron serializes.

**Chromium switches (`QA_ELECTRON_ARGS`).** The app applies, before `ready`, the `DEFAULT_SWITCHES` of `desktop/chromium-switches.ts` and then the ones in `QA_ELECTRON_ARGS`. `DEFAULT_SWITCHES` is empty in this version, and by product decision the GPU stays on whenever the computer has one: no default may ever contain `--disable-gpu`, `--disable-software-rasterizer` or `--in-process-gpu`. On a machine without a GPU Chromium falls back to software rendering by itself; nothing is forced. `QA_ELECTRON_ARGS` is a space-separated list; it adds to the defaults and, for the same switch, overrides the default. `QA_NO_DEFAULT_SWITCHES=1`, or `QA_ELECTRON_ARGS=` (set and empty), turns the defaults off, so a run can be compared A/B against exactly its own list. With `QA_PERF=1` the switches actually applied are printed on stderr. The list is filtered: `desktop/electron-args.ts` accepts only `--disable-gpu`, `--disable-software-rasterizer`, `--in-process-gpu`, `--enable-features=`, `--disable-features=` and `--js-flags=` (value limited to letters, digits and `_ . , : = + -`, one token of at most 200 characters, at most 20 switches; for `--js-flags` that means a single V8 flag such as `--js-flags=--max-old-space-size=512`). Anything else (`--no-sandbox`, `--remote-debugging-*`, `--inspect*`, `--user-data-dir`, `--proxy-*`, `--load-extension`…) is ignored and listed on stderr. The three GPU switches stay in the allow-list only as a measurement tool, to understand where memory goes; they are not candidates for a default. The environment reaches the app because `tests/ui/run.mjs` and `tests/ui/launch.ts` pass `process.env` on to Electron (only `QA_SCREENSHOT`, `ELECTRON_RUN_AS_NODE` and `PWDEBUG` are removed). Compare a run with a switch against a run without it on the same machine; under Xvfb there is no real GPU, so the effect of a GPU switch there is not what a user would see.

**A/B matrix of switches.** Each configuration is `QA_ELECTRON_ARGS` for a whole run, to understand what each switch costs or saves: E0 empty, E1 `--disable-gpu`, E2 `--disable-gpu --disable-software-rasterizer`, E3 `--enable-features=NetworkServiceInProcess2`, E4 = E1 + E3, E5 `--js-flags=--max-lazy`. It is a tool for understanding consumption, not for choosing a default (the GPU decision is already made, see above). `npm run measure:memory -- --label ab --matrix E0,E1,E2,E3,E4,E5 --only S-floor,S0,S2` repeats the chosen scenarios once per configuration, with `QA_NO_DEFAULT_SWITCHES=1` so each one is exactly its list, and writes `build/memory/ab-e0-<date>.json`, `ab-e1-<date>.json`… (compare any two with `compare`). The same can be done by hand with a shell loop: `for a in "" "--disable-gpu"; do QA_ELECTRON_ARGS="$a" npm run measure:memory -- --label "x$RANDOM" --only S-floor,S2; done`. Every result file records the switches it used under `meta.electron_args`: the raw `QA_ELECTRON_ARGS` (`null` when not set, empty when set and empty), `QA_NO_DEFAULT_SWITCHES`, the accepted and the rejected switches (what `desktop/electron-args.ts` drops) and what the app itself printed about them on stderr, when it was captured. S-floor applies the same `QA_ELECTRON_ARGS` (`tests/perf/floor-main.mjs` has a small copy of the parser) so the matrix is comparable there; it does not apply `DEFAULT_SWITCHES`, which is empty. Memory is read on the real machine, not under Xvfb, for any conclusion about the GPU or about absolute numbers.

**On the user's own machine (`proc-snapshot.sh`).** `bash tests/perf/proc-snapshot.sh [pid]` (Linux, read-only: it only reads `/proc`, sends no signal and changes nothing; it is not marked executable) prints RSS, PSS and USS in MB per type (`browser`, `renderer`, `gpu`, `utility`, `zygote`, `other`), the total, and a last line with what the status bar used to show (the sum of RSS) against the PSS and their ratio. It looks only at processes whose executable is this repository's `node_modules/electron/dist/electron`; with a `pid` it keeps that process and its descendants that are Electron processes of this repository (the renderers and the GPU process that Chromium forks from its zygote, not only the direct children). Terminal shells are not Electron, so they are not counted. A process that disappears or cannot be read is skipped; with nothing to read it says so and exits 0. Use it with the app running (`npm run app:dev` or an installed build started from this repository) to see the real footprint without Xvfb.

**New scenarios.** S11 reports `open_ms`, the peak and settled renderer memory, `pages`, `canvas_peak` and `canvas_end` (canvases alive in `.pdf-pages`, counted while scrolling and at the end), `canvas_after_close` and `renderer_growth_pct` (renderer memory at the end of the scroll against 25% of it). S12 reports, for the burst only, `cpu_main_s`, the IPC calls and bytes, `loop_lag_max_ms` and the `readFile` calls per open tab (`tab_readfile_calls`, `readfile_tab_a/b/c`); the tabs' files do not change, so every re-read is waste (`tab_files_changed` is 0). S13 reports `tree_rows` and, for the note and for the `.md` (prefixes `note_` and `md_`), the latency from key to the next frame (`_key_p50_ms`, `_key_p95_ms`, `_key_max_ms`) and the long tasks (over 50 ms) in the window (`_long_tasks`, `_long_task_max_ms`).

**Suggested acceptance criteria** (`--goal perf` checks S2, S11 growth, S12 and S6 against the after report alone): S2 peak at most 590 MB; S11 without linear growth (`renderer_growth_pct` at most 10 and `canvas_peak` not growing with the pages); S5 renderer at least 30% below the original baseline (`--goal c5`); S12 tab re-reads at most the number of files really changed; S6 `loop_lag_max_ms` at most 50 ms. Under Xvfb the GPU is drawn by software, so compare runs of the same machine; the absolute numbers are not what a person sees.

## Adding a test

| You changed | Add |
|---|---|
| A function with no effects (parser, format, rule) | A unit test in the file of its area |
| Something the desktop service does | An integration test in `desktop.test.ts` (or `mcp.test.ts`, `companion*.test.ts` for those areas) with a fake for each effect |
| What the person sees or clicks | An interface test in `tests/ui/app.spec.ts`, in the block of its screen |
| A text of the app | A pt-BR translation (`i18n.test.ts` fails without it) |

Then run `npm run test-catalog`: it adds the scenario to the catalog, and stops if a new test file has no rule in `scripts/catalog-tests.mjs` (give it its area and kind there). Add the scenario's Portuguese title to `docs/pt-BR/test-scenarios.json`: until then the Portuguese catalog shows it in English, and the script says which ones are missing.

Before a commit: `npm run typecheck`, `npm run check`, `npm test`, and `npm run test:ui` when the window changed (and `npm run measure:memory` against a baseline when the change is about memory or load).

## What has no automated test

| Part | Why it matters | Covered today by |
|---|---|---|
| The desktop main process wiring (`desktop/main.ts`: IPC handlers, the terminal exit hook) | It connects the window, the terminals and the service | Indirectly, by the interface tests |
| The VS Code extension host (`ide/vscode/host.ts`, `extension.ts`) and its panel (`app/src/companion/`) | Project detection, MCP registration, terminals and operations in the IDE | The panel's API (`companion-api.test.ts`) only |
| Terminal output kept for a returning tab (`desktop/terminals.ts`) | Terminals outliving the project screen | One interface test |
| The CLI helpers (`new-project`, `new-run`, `runs`) and the terminal menu (`qa --terminal`) | Documented commands for AI tools and people | Not tested |
| The interface tests in CI | They only run when someone runs them | Not in CI |
| Coverage | Knowing what the tests miss | Not measured |
