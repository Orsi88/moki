# Contributing

Edit `skills/` and `core/` for behaviour, `app/` and `desktop/` for the window. Then:

```bash
npm run build
npm run typecheck
npm run check
npm test
```

Do not edit `.agents/skills/` or `.claude/skills/` by hand; `npm run build` rewrites them. Keep examples synthetic. When this guide changes, update `README.md` and `README.pt-BR.md` together.

How the window is built: [desktop-app.md](desktop-app.md). How a skill is shaped: [skill-standard.md](skill-standard.md).

To understand or plan a change, ask the `moki-consultant` agent: it only reads, and answers with a proposal that shows the code and its impact. To implement it after your approval, use `moki-executor`, which also runs the checks. Both follow the `moki-architecture` and `moki-change` skills ([agents.md](agents.md#framework-agents)).

| Path | What it is |
|---|---|
| `AGENTS.md` | What an AI tool reads when this folder is opened: rules and the skill catalog |
| `skills/`, `agents/`, `core/` | Skills, built-in agents, shared policies — edit here |
| `app/`, `desktop/` | The window |
| `ide/vscode/`, `ide/mcp/` | The VS Code extension (IDE Companion) and the read-only Moki MCP server for the AI of the IDE |
| `workspace/`, `workspaces/` | Local workspaces and projects — never versioned |

### Documentation and the wiki

The documentation is edited here, in `docs/`, and the [GitHub wiki](https://github.com/Orsi88/moki/wiki) is generated from it: every change goes through a pull request and `npm run check` validates its links. User guides have a Portuguese version in `docs/pt-BR/`.

| To | Do |
|---|---|
| Change a page | Edit its file in `docs/` (and its `docs/pt-BR/` version, when it has one) |
| Add a page | Create the file and add it to a section of `docs/wiki.json` (with `"pt"` for a translation) |
| See the wiki before publishing | `npm run wiki` writes it to `release/wiki/` |
| Publish | A push to `main` that changes `docs/` runs `.github/workflows/wiki.yml`. Running the workflow by hand from another branch publishes that branch, marked as in development; the next push to `main` replaces it |

Never edit the wiki itself: each publication replaces it. The README is the short introduction; keep `README.md` and `README.pt-BR.md` in step.
