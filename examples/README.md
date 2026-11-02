# Examples

Synthetic material for exercising the skills. Everything here is fictional ("Acme Library", a library loan system) — never put real project content in this folder.

| Folder | Skill | Language of input |
|---|---|---|
| [project-context](project-context/README.md) | `project-context` | en |
| [requirements-review](requirements-review/README.md) | `requirements-review` | pt-BR (tests the original labels) |
| [test-design](test-design/README.md) | `test-design` | en |
| [failure-analysis](failure-analysis/README.md) | `failure-analysis` | en |
| [api-testing](api-testing/README.md) | `api-testing` | en |
| [evidence-collection](evidence-collection/README.md) | `evidence-collection` | en |
| [evidence-sheet](evidence-sheet/README.md) | `evidence-sheet` | en (model in pt-BR) |
| [evidence-document](evidence-document/README.md) | `evidence-document` | en |
| [qa-orchestrator](qa-orchestrator/README.md) | `qa-orchestrator` | en |
| [moki-architecture](moki-architecture/README.md) | `moki-architecture` | en (acts on this repository, no project) |
| [moki-change](moki-change/README.md) | `moki-change` | en (acts on this repository, no project) |

## How to run an example

1. `npm run new-project -- acme-library "Acme Library"` (once).
2. Copy the example input files into `workspace/projects/acme-library/inbox/`.
3. Ask your AI tool what the example's README says.
4. Check the result against the README's **acceptance checklist**. Where a deterministic check exists (`npm run check-output ...`), run it — a plausible-looking answer is not a pass.
5. Record the result (tool, model, date, pass/fail per item) in [docs/compatibility-tests.md](../docs/compatibility-tests.md).
