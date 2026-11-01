# QA skills and agents

A **skill** is the instructions for one activity: steps, rules, output and where to stop for your approval. The AI reads them. An **agent** is a role that uses one or more skills.

The activities that ship with Moki:

| Activity | What you get | Status |
|---|---|---|
| [Review user stories](../skills/requirements-review/SKILL.md) | Ambiguities, gaps, one question at a time, a review matrix (Excel) and a final definitions report (PDF). | ready |
| [Design tests](../skills/test-design/SKILL.md) | Scenario map, then — after your OK — manual test cases in Excel. | ready |
| [Failure pre-analysis](../skills/failure-analysis/SKILL.md) | A short note for developers, from your description and the log. | ready |
| [Build test evidence](../skills/qa-orchestrator/references/workflows/test-evidence.md) | The work item and the Jam recordings, then a spreadsheet and a Word document with the prints, in your own models when you have them. | ready |
| [Project context](../skills/project-context/SKILL.md) | Onboarding, updates, and the plan for a blank project. | ready |
| [Automation](../skills/automation/SKILL.md) | Build, implement or evolve an automation project. | not available yet |
| [Documentation](../skills/documentation/SKILL.md), [smoke test](../skills/smoke-test/SKILL.md) | Planned. The AI will say so and stop. | not available yet |

**Ready** means usable, still being checked across AI tools. Ask in plain language ("review this story", "map the tests", "here is the log"). The built-in ones identify the project, record a run, and stop when they need a decision. "ok", "approved" or "go ahead" accepts the step in front of you. They do not invent requirements, messages or results: a gap becomes a pending item.

Chains such as "review this, and once I approve it, map the tests" go through the orchestrator, which shows the plan and waits at each gate. The definitions are in [skills/qa-orchestrator/references/workflows/](../skills/qa-orchestrator/references/workflows/).

Skills you add live with the project (`<linked folder>/.claude/skills/` or `workspace/projects/<id>/skills/`) or for every project (`~/.claude/skills/` and `~/.agents/skills/`). Agents you create follow the same split; a copy of a built-in agent stays in `workspace/library/agents/`. The request names them. Moki does not run a skill by itself. More on agents: [agents.md](agents.md).
