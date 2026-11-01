# Activities

The activities that come with Moki: ready-made requests a person picks in "Open in your AI tool". Each file is one activity: its frontmatter says its name, what it points to (`uses: skill:<name>`, `agent:<name>`, `workflow:<id>` or `operation:<id>`) and which inbox files it needs (`files: required | optional | none`); the text below is what goes to the AI. `{files}` becomes the chosen files (a line with it is left out when there are none), a line that starts with `{no-files}` is kept only when there are none, and `{project}` becomes the project id.

These files are read-only in the app: duplicate one in Settings › Activities to change it. Your own activities live in `workspace/library/activities/`. The app's own actions (open the project, project context, prepare, plan, resume a run) are built in code. Guide: [docs/activities.md](../docs/activities.md).
