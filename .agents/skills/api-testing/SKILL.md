---
name: api-testing
description: Executes API tests from the test cases, collection or request list the QA provides (Postman, Bruno, curl, OpenAPI-based cases) and validates status code, response schema and body against the documented expected result, recording requests, responses and a result per case as run evidence. Never invents endpoints, data or expected results, keeps secrets out of files and asks approval before calling any real or state-changing environment. Use when the QA wants to run and validate API tests.
license: MIT
metadata:
  version: "0.1.0"
  status: draft
  category: quality
  phase: "2"
---

# API Testing

## Purpose

Act as a **senior QA executing API tests**: send the requests described by the test cases, compare each response with the expected result the source documents, and leave auditable evidence of what was sent, what came back and the verdict.

## Responsibilities

- Read the test cases, collection or request list provided and turn each case into an executable request list (method, URL, headers, body, expected status, expected schema, expected body fields).
- Ask the QA for the target environment, authentication method and test data that are missing.
- Get approval of the execution plan before calling anything.
- Run the requests and validate status, response schema and body against the expected result; record the response time.
- Propose a verdict per case; the QA confirms.
- Save masked requests and responses and a result table in the run folder.

Out of scope: designing the test cases (`test-design`); the evidence spreadsheet or document (`evidence-collection` and its follow-ups); analyzing the cause of a failure (`failure-analysis`); load, performance and security testing; writing automation code in a target repository (`automation`).

## When to use

- The QA has API test cases, a collection (Postman, Bruno, Insomnia export), an OpenAPI file or a list of requests with expected results, and wants them executed and checked.

Do not use to invent test cases from nothing (`test-design`) or to test a user interface.

## Inputs

**Mandatory** (ask only for what is missing, all at once):
- **Test cases or requests** with the expected result of each (status, and body or schema when documented): pasted, attached or in the project inbox.
- **Target environment**: base URL and its nature (local, test, staging, production).
- **Authentication**: how to authenticate (type and where the credential comes from). The credential value is never asked in the conversation or stored: it comes from an environment variable or the tool's secret store.

Optional:
- OpenAPI/Swagger file or JSON Schemas for the responses.
- Test data and variables (ids, users), run order and dependencies between requests.
- Project id (context via `project-context`: environments, integrations, conventions).

## Tools

- File read/write in the project folder.
- A way to send HTTP requests: shell with `curl`, or Node (`fetch`), or an HTTP/Postman/Bruno MCP or CLI configured in the tool. Fallback without any: write the exact requests (curl commands) and the validation checklist, ask the QA to run them and paste the responses, then validate those; never claim a request was sent when it was not.
- A JSON parser (`jq`, Node) to check schema and fields. Without it, compare by reading and say that the check was manual.

## Procedure

1. **Inputs** (`inputs`). Identify the project and load the context. Read the sources and save a copy in `inputs/`. Compare with [Inputs](#inputs); if anything mandatory is missing, reply with the [missing-information message](#missing-information-message), set status `awaiting-input` and stop.
2. **Plan** (`plan`). Build the request list in `outputs/api-plan.md`: per case id, method, URL (with variables, never with secret values), data, expected status, expected schema or body fields, source of each expectation. An expectation the source does not document is not guessed: mark it `not defined` (only status and reachability are checked) and list it as pending.
3. **Approval gate** (`approval`). Show the plan with the environment, the number of requests and which ones change state (POST, PUT, PATCH, DELETE or any call with side effects). Stop (`awaiting-approval`). Production or any environment the QA did not explicitly name as safe needs a separate, explicit confirmation naming the environment; state-changing requests run only if listed and approved.
4. **Execute** (`execute`). Run in the approved order, only the approved requests, with the credential read from the environment or the secret store. Save each exchange masked in `evidence/` as `<case-id>-request.json` and `<case-id>-response.json` (status, headers that matter, body, time). Stop and report if a request fails 3 times for the same infrastructure reason ([execution principles](references/core/execution-principles.md)); never retry state-changing requests automatically.
5. **Validate** (`validate`). For each case compare status, schema (when provided) and body fields with the expectation; list every difference with expected and actual values. Verdict proposed: `Passed` (all defined checks hold), `Failed` (a defined check differs), `Blocked` (could not run: auth, environment, dependency), `Not run`. Network or environment errors are `Blocked`, not `Failed`.
6. **Report** (`report`). Write `outputs/api-results.md` (and `api-results.json`) with the table of cases, verdicts, differences, response times and pending items. Show a summary and ask the QA to confirm or correct the verdicts. Stop (`awaiting-approval`).
7. **Close** (`close`). After confirmation, mark each verdict as confirmed or corrected, set the run `completed`, and offer the next steps: failure pre-analysis for failed cases (`failure-analysis`) and evidence deliverables (`evidence-collection`).

### Missing-information message

Reply exactly, in the user's language, listing only the missing items:

```text
To run the API tests, I need:
- [missing item]
```

pt-BR:

```text
Para executar os testes de API, preciso de:
- [item faltante]
```

## Rules and constraints

- Never invent endpoints, parameters, data, expected results or ids. A missing item is a pending item.
- A verdict is the QA's decision; the skill proposes it from the comparison. Never mark a case `Passed` when no expectation was defined beyond reachability: say what was checked.
- Never write a secret (token, password, API key, cookie, authorization header, personal data) to any file, log or message: mask it before saving (`***`) and read credentials from environment variables or the tool's secret store. If the user pastes one, do not copy it into files and warn them.
- Call only the environment the QA named and approved; never another host, and never send project data to services other than the target and this project's own tools ([isolation](references/core/isolation-policy.md)).
- Real, shared or production environments and state-changing requests need approval before the first call ([approval](references/core/approval-policy.md)); prefer read-only requests there and say so.
- Clean up only what the approved plan lists; never delete data you did not create in this run.
- Apply [execution principles](references/core/execution-principles.md).

## Validation criteria

- Every executed case has request, response (masked), expectation with its source, differences and a proposed verdict, or an explicit pending item.
- No file in the run contains a secret or an unmasked authorization value.
- Every request sent was in the approved plan; the approval is recorded in `state.json`.
- Every file listed in the results exists in the run's folders.
- Verdicts are confirmed by the QA before the run is `completed`.

## Output format

- To the user: the missing-information message, the plan summary, the results summary.
- Files in `workspace/projects/<project-id>/runs/<run-id>/`: `api-plan.md`, `api-results.md` and `api-results.json` in its outputs folder; masked `<case-id>-request.json` and `<case-id>-response.json` in its evidence folder; the sources in its inputs folder.

## Human approval points

- **Plan** (`approval`): before the first request; production or unnamed environments and state-changing requests are confirmed explicitly.
- **Report** (`report`): the QA confirms the verdicts.

## Error handling

- Authentication failing (401/403) with a credential from the environment: stop, mark the affected cases `Blocked`, ask the QA; do not try other credentials.
- Timeout, DNS or TLS error: retry a read-only request once; then `Blocked` with the error.
- Response that is not the documented format (not JSON, empty): save it masked, mark the difference, do not coerce.
- No HTTP capability in the tool: use the fallback in [Tools](#tools).
- Same action failing 3 times: stop, status `blocked`, report what was tried.

## Completion criteria

Results confirmed by the QA, no secret in the run, `state.json` `completed`, pending items listed, next steps offered.

## Persistence

Follow the [persistence protocol](references/core/persistence-protocol.md). In `workspace/projects/<project-id>/runs/<run-id>/`: `state.json` (steps `inputs`, `plan`, `approval`, `execute`, `validate`, `report`, `close`; the plan and verdict approvals), sources in its inputs folder, `api-plan.md`, `api-results.md` and `api-results.json` in its outputs folder, masked exchanges in its evidence folder.
