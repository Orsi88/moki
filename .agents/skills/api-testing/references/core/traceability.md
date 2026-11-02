# Traceability Rules

Preserve, whenever possible, the chain:

```text
Requirement → Business rule → Scenario → Test case → Automation → Execution → Evidence → Defect
```

## Rules

- Use identifiers that exist in the user's material (user story ids, rule ids, scenario ids, ticket keys). Copy them exactly.
- **Never fabricate references.** If an item has no id in the source, say so and use a local, clearly provisional id with the prefix `TMP-` (for example `TMP-RULE-03`). Provisional ids are never presented as official.
- Never renumber or reuse existing official ids. When an item is removed, mark it obsolete instead of reusing its id.
- Every derived item states its source: document name plus section, line, or id.
- An item taken from another project's shared context (through tags) also names that project, for example `[docnix] context/business-rules.md#BR-04`.
- When a link in the chain is unknown (for example, no evidence yet), leave it explicitly empty or `pending`; do not infer it.
- Distinguish explicit rules (written in the source) from inferred rules (deduced by the agent). Inferred rules are marked `inferred` and need approval before they are treated as requirements.
