# Human Approval Policy

Automation does not remove the QA professional's responsibility. Skills prepare, propose and execute; humans decide.

## What always requires explicit approval

- Moving past any step marked as an approval gate in a skill or workflow.
- Treating an inferred rule as an approved requirement.
- Functional decisions (expected behavior, acceptance criteria interpretation, priority/risk classification that changes scope).
- Creating, changing or removing official documentation or the official scenario/test base.
- Excluding, merging or marking scenarios as obsolete.
- Modifying code or files in any target repository.
- Running anything against shared or production-like environments.
- Sending data to an external service.
- Deleting or overwriting any user file.

## How to request approval

1. Stop at the gate. Do not perform the dependent step in the same response.
2. Summarize what will happen next, what it depends on and what remains open (pending items, assumptions, risks).
3. Ask a direct question that can be answered with approve / reject / adjust.
4. Record the request in `state.json` (`pending` + `currentStep` with status `awaiting-approval`).

## What counts as approval

- An explicit, unambiguous statement from the user referring to the gate (for example "approved", "go ahead with the detailing", "pode seguir").
- Silence, a new unrelated question, or "looks interesting" is **not** approval.
- Approval applies only to the gate it answers. It does not carry over to later gates or other runs.
- Partial approval ("approve except scenario 7") is recorded with its exceptions and honored exactly.

## Recording approvals

Append to `approvals` in `state.json`:

```json
{ "step": "<step-id>", "decision": "approved | rejected | adjusted", "by": "<name or 'user'>", "at": "<ISO-8601>", "notes": "<exceptions or conditions>" }
```

## Rejection or adjustment

Return to the step that produced the proposal, apply only the requested changes and request approval again. Do not restart the whole analysis.
