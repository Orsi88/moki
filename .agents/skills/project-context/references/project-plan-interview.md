# Planning a blank project

A blank project (`"starter": "blank"` in `project.json`) starts without `context/`. Instead of the QA onboarding, interview the user about what this project needs and leave a plan the user reviews in the desktop app (or in the chat) before anything is created.

## Rules

- **One question per turn.** Start from the description in `project.json`; ask only what it and the provided documents do not answer.
- Stop as soon as the plan can be written; topics can be gathered later.
- Recommend only skills and agents from the lists in the request (or that exist in the project). A skill the project needs but nobody installed goes in `searchSkills` as a short search term, never as an installed name.
- Never install skills, link skills or agents, or create context files during the interview.

## Topics, in order

| # | Topic | Why it matters |
|---|---|---|
| 1 | Goal and expected deliverables | Decides which context and skills are useful |
| 2 | Technologies, repository and environments | Linked folder, tools, skills to search |
| 3 | Team and ways of working | Conventions, deliverable language, approvals |
| 4 | What to link: skills, agents, knowledge sources, inbox documents | The recommendation itself |
| 5 | Which knowledge must be recorded, and which folders would help | The context files and project folders to propose |

## Output

1. `proposed-updates.md`: the plan in plain language, one `PU-###` entry per context file to create (target file, content, source = interview answer) plus the reasons for each recommended skill and agent.
2. `plan.json` in the project folder:

```json
{
  "approved": false,
  "skills": ["<installed global skill>"],
  "agents": ["<available agent>"],
  "searchSkills": ["<search term for a skill to install>"],
  "folders": [{ "path": "<folder-name or parent/folder-name>", "contains": "<one line>" }],
  "contextFiles": [{ "path": "context/<kebab-name>.md", "contains": "<one line>" }]
}
```

`contextFiles` paths are `context/<lowercase-kebab-name>.md`. Folder paths are relative to this project, use lowercase letters, numbers, hyphens and `/` only, with no empty segments; never propose hidden folders or paths outside the project. Then stop and tell the user to review the plan in the app ("The AI proposed a plan — review it"). Without the app, show the plan and ask for approval item by item; record it by setting `"approved": true` and keeping only the approved items.

## After approval

When `plan.json` has `"approved": true`: create only the listed `folders` and `contextFiles`, inside the project folder. Validate each path and resolve symlinks before creating anything; reject paths that leave the project, and never overwrite existing files. For context files use only confirmed answers (source and confirmation date on each entry), create `context/index.md` listing them, add them to `project.json` `contextFiles`, mark the matching proposals `promoted` and set `onboardingStatus` to `partial`. Skills and agents were already linked by the app. Older approved plans may omit `folders`; treat that as an empty list.
