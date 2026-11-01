// Deterministic validation of the framework itself. See docs/skill-standard.md.
// Usage: node scripts/validate.mjs

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, listSkillDirs, walkFiles, relPosix, readJson, SLUG } from './lib/repo.mjs';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { validateSchema } from './lib/schema.mjs';
import { findDrift } from './build.mjs';
import { listAgents, listCategories, parseAgent, validateAgent } from './lib/agents.ts';
import { builtinDir, isMokiActivity, parseActivity } from './lib/activities.ts';

// Agent Skills spec fields only, so skills load in every compatible tool.
const ALLOWED_KEYS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
// draft = usable, not yet validated in two tools; the others are not usable
// and must say so in the description that tools read before loading the skill.
export const STATUSES = { stable: '', draft: '', 'pending-migration': '[PENDING MIGRATION]', planned: '[PLANNED]' };
export const REQUIRED_SECTIONS = [
  'Purpose',
  'Responsibilities',
  'When to use',
  'Inputs',
  'Tools',
  'Procedure',
  'Rules and constraints',
  'Validation criteria',
  'Output format',
  'Human approval points',
  'Error handling',
  'Completion criteria',
  'Persistence',
];
// Paths a skill may name as write destinations or bundled resources.
// Run results and project knowledge always live inside one project folder.
const OUTPUT_PATH_PREFIXES = ['workspace/projects/<project-id>/', '<target-repo>/', 'references/', 'assets/'];
const MAX_SKILL_LINES = 500;
const AGENTS_MD_MAX_BYTES = 32 * 1024; // Codex default project_doc_max_bytes
const WORKFLOWS_DIR = 'skills/qa-orchestrator/references/workflows';

export function validate(root = ROOT, { checkDrift = true } = {}) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const skills = listSkillDirs(root);
  const statusBySkill = {};

  for (const dir of skills) {
    const where = `skills/${dir}`;
    if (!SLUG.test(dir)) err(where, 'folder name must be lowercase letters, digits and single hyphens');
    const skillFile = join(root, 'skills', dir, 'SKILL.md');
    if (!existsSync(skillFile)) { err(where, 'missing SKILL.md'); continue; }
    const text = readFileSync(skillFile, 'utf8');
    const { data, body, errors: fmErrors } = parseFrontmatter(text);
    fmErrors.forEach((e) => err(`${where}/SKILL.md`, e));
    if (!data) continue;

    for (const key of Object.keys(data)) {
      if (!ALLOWED_KEYS.includes(key)) err(`${where}/SKILL.md`, `frontmatter key "${key}" is not part of the portable Agent Skills spec`);
    }
    const name = data.name ?? '';
    if (!name) err(`${where}/SKILL.md`, 'missing name');
    else {
      if (name.length > 64 || !SLUG.test(name)) err(`${where}/SKILL.md`, `invalid name "${name}" (1-64 chars, a-z 0-9 and single hyphens)`);
      if (name !== dir) err(`${where}/SKILL.md`, `name "${name}" must match folder name "${dir}"`);
    }
    const description = typeof data.description === 'string' ? data.description : '';
    if (!description) err(`${where}/SKILL.md`, 'missing description');
    if (description.length > 1024) err(`${where}/SKILL.md`, `description has ${description.length} chars (max 1024)`);
    if (!data.license) err(`${where}/SKILL.md`, 'missing license');

    const meta = typeof data.metadata === 'object' ? data.metadata : {};
    if (!meta.version || !/^\d+\.\d+\.\d+$/.test(meta.version)) err(`${where}/SKILL.md`, 'metadata.version must be semver (e.g. "0.1.0")');
    const status = meta.status;
    statusBySkill[dir] = status;
    if (meta.category !== undefined && !SLUG.test(meta.category)) err(`${where}/SKILL.md`, 'metadata.category must be lowercase letters, digits and hyphens');
    if (!(status in STATUSES)) err(`${where}/SKILL.md`, `metadata.status must be one of ${Object.keys(STATUSES).join(', ')}`);
    else if (STATUSES[status] && !description.startsWith(STATUSES[status])) {
      err(`${where}/SKILL.md`, `description of a "${status}" skill must start with ${STATUSES[status]} so agents do not treat it as available`);
    } else if (!STATUSES[status] && /^\[(PLANNED|DRAFT|PENDING MIGRATION)\]/.test(description)) {
      err(`${where}/SKILL.md`, `"${status}" skill description must not carry a status prefix`);
    }

    const lineCount = text.split('\n').length;
    if (lineCount > MAX_SKILL_LINES) err(`${where}/SKILL.md`, `${lineCount} lines (max ${MAX_SKILL_LINES}); move detail to references/`);

    const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
    for (const section of REQUIRED_SECTIONS) {
      if (!headings.some((h) => h === section || h.startsWith(`${section} `))) err(`${where}/SKILL.md`, `missing section "## ${section}"`);
    }

    checkOutputPaths(body, `${where}/SKILL.md`, err);

    for (const file of walkFiles(join(root, 'skills', dir)).filter((f) => f.endsWith('.md'))) {
      checkLinks(root, file, err, { skillRoot: join(root, 'skills', dir) });
    }
  }

  // Usable skills need a synthetic example so they can be exercised.
  for (const [skill, status] of Object.entries(statusBySkill)) {
    if (['stable', 'draft'].includes(status) && !existsSync(join(root, 'examples', skill))) err(`skills/${skill}`, `${status} skill has no examples/${skill}/`);
  }

  validateWorkflows(root, skills, err);
  validateAgents(root, skills, err);
  validateAgentsMd(root, skills, err);
  validateActivities(root, skills, err);
  validateSchemas(root, err);

  for (const file of ['README.md', 'README.pt-BR.md', 'AGENTS.md'].map((f) => join(root, f)).filter(existsSync)) checkLinks(root, file, err);
  for (const dir of ['docs', 'adapters', 'examples', 'templates', 'workspace', 'core']) {
    for (const file of walkFiles(join(root, dir)).filter((f) => f.endsWith('.md'))) {
      if (dir === 'workspace' && relPosix(root, file) !== 'workspace/README.md') continue;
      checkLinks(root, file, err);
    }
  }

  if (checkDrift) findDrift(root).forEach((d) => err('mirrors', `${d} (run npm run build)`));
  return errors;
}

function checkOutputPaths(body, where, err) {
  for (const section of ['Output format', 'Persistence']) {
    const match = body.match(new RegExp(`^## ${section}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
    if (!match) continue;
    for (const [, path] of match[1].matchAll(/`([^`\s]+\/[^`\s]*)`/g)) {
      if (!OUTPUT_PATH_PREFIXES.some((p) => path.startsWith(p))) {
        err(where, `"## ${section}" names path "${path}" outside ${OUTPUT_PATH_PREFIXES.join(', ')}`);
      }
    }
  }
}

function checkLinks(root, file, err, { skillRoot } = {}) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, rawTarget] of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(https?:|mailto:|#)/.test(rawTarget)) continue;
    const target = decodeURI(rawTarget.split('#')[0]);
    if (!target) continue;
    let resolved = join(dirname(file), target);
    // references/core/* is injected at build time from core/.
    if (skillRoot) {
      const rel = relPosix(skillRoot, resolved);
      if (rel.startsWith('..')) { err(relPosix(root, file), `link "${rawTarget}" leaves the skill folder (skills must be self-contained)`); continue; }
      if (rel.startsWith('references/core/')) resolved = join(root, 'core', rel.slice('references/core/'.length));
    }
    if (!existsSync(resolved)) err(relPosix(root, file), `broken link "${rawTarget}"`);
  }
}

export function extractWorkflow(text) {
  const match = text.match(/```json workflow\n([\s\S]*?)```/);
  if (!match) return { error: 'missing ```json workflow block' };
  try { return { workflow: JSON.parse(match[1]) }; } catch (e) { return { error: `invalid JSON: ${e.message}` }; }
}

function validateWorkflows(root, skills, err) {
  const dir = join(root, WORKFLOWS_DIR);
  if (!existsSync(dir)) return;
  const schema = readJson(join(root, 'schemas', 'workflow.schema.json'));
  for (const file of walkFiles(dir).filter((f) => f.endsWith('.md'))) {
    const where = relPosix(root, file);
    const { workflow, error } = extractWorkflow(readFileSync(file, 'utf8'));
    if (error) { err(where, error); continue; }
    validateSchema(schema, workflow).forEach((e) => err(where, e));
    if (workflow.id !== basename(file, '.md')) err(where, `workflow id "${workflow.id}" must match file name`);
    const seen = new Set();
    for (const step of workflow.steps || []) {
      if (seen.has(step.id)) err(where, `duplicate step id "${step.id}"`);
      if (!skills.includes(step.skill)) err(where, `step "${step.id}" uses unknown skill "${step.skill}"`);
      for (const dep of step.dependsOn || []) {
        if (!seen.has(dep)) err(where, `step "${step.id}" depends on "${dep}", which is not an earlier step`);
      }
      seen.add(step.id);
    }
  }
}

// Built-in agents (agents/<category>/<name>.md): same rules the app uses for custom agents.
function validateAgents(root, skills, err) {
  const dir = join(root, 'agents');
  if (!existsSync(dir)) return;
  const categories = listCategories(root).filter((c) => c.source === 'builtin').map((c) => c.id);
  for (const file of walkFiles(dir).filter((f) => f.endsWith('.md'))) {
    const where = relPosix(root, file);
    const parts = where.split('/');
    if (parts.length !== 3) { err(where, 'agents must be at agents/<category>/<name>.md'); continue; }
    const { agent, errors } = parseAgent(readFileSync(file, 'utf8'), 'builtin', where);
    errors.forEach((e) => err(where, e));
    if (agent) validateAgent(agent, { skills, categories, fileName: basename(file, '.md'), folder: parts[1] }).forEach((e) => err(where, e));
  }
  const text = existsSync(join(root, 'AGENTS.md')) ? readFileSync(join(root, 'AGENTS.md'), 'utf8') : '';
  for (const a of listAgents(root).filter((x) => x.source === 'builtin')) {
    if (!text.includes(`\`${a.name}\``)) err('AGENTS.md', `agent "${a.name}" is not listed in the agent catalog`);
  }
}

// activities/*.md: each one parses, has a free id, and points to a skill, workflow or agent of the framework (operations live in workspaces).
function validateActivities(root, skills, err) {
  const dir = builtinDir(root);
  if (!existsSync(dir)) return;
  const agents = new Set(listAgents(root).filter((a) => a.source === 'builtin').map((a) => a.name));
  for (const file of walkFiles(dir).filter((f) => f.endsWith('.md') && basename(f) !== 'README.md')) {
    const where = relPosix(root, file);
    const id = basename(file, '.md');
    const { activity, errors } = parseActivity(readFileSync(file, 'utf8'), id, 'builtin', file);
    errors.forEach((e) => err(where, e));
    if (!activity) continue;
    if (isMokiActivity(id)) err(where, `"${id}" is an action of the app: choose another id`);
    const { kind, name } = activity.target;
    if (kind === 'skill' && !skills.includes(name)) err(where, `uses the unknown skill "${name}"`);
    if (kind === 'workflow' && !existsSync(join(root, 'skills', 'qa-orchestrator', 'references', 'workflows', `${name}.md`))) err(where, `uses the unknown workflow "${name}"`);
    if (kind === 'agent' && !agents.has(name)) err(where, `uses the unknown agent "${name}"`);
    if (kind === 'operation') err(where, 'an activity of the framework cannot use an operation (operations live in each workspace)');
  }
}

function validateAgentsMd(root, skills, err) {
  const file = join(root, 'AGENTS.md');
  if (!existsSync(file)) { err('AGENTS.md', 'missing'); return; }
  const text = readFileSync(file, 'utf8');
  if (statSync(file).size > AGENTS_MD_MAX_BYTES) err('AGENTS.md', `larger than ${AGENTS_MD_MAX_BYTES} bytes (Codex default limit)`);
  for (const skill of skills) {
    if (!text.includes(`\`${skill}\``)) err('AGENTS.md', `skill "${skill}" is not listed in the catalog`);
  }
  for (const [, name] of text.matchAll(/skills\/([a-z0-9-]+)\//g)) {
    if (!skills.includes(name)) err('AGENTS.md', `references unknown skill folder "skills/${name}/"`);
  }
}

function validateSchemas(root, err) {
  for (const file of walkFiles(join(root, 'schemas')).filter((f) => f.endsWith('.json'))) {
    try { readJson(file); } catch (e) { err(relPosix(root, file), `invalid JSON: ${e.message}`); }
  }
  const template = join(root, 'templates', 'project-context', 'project.json');
  if (existsSync(template)) {
    const schema = readJson(join(root, 'schemas', 'project-context.schema.json'));
    validateSchema(schema, readJson(template)).forEach((e) => err('templates/project-context/project.json', e));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validate();
  if (errors.length) {
    console.error(`Validation failed with ${errors.length} problem(s):`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log(`Validation passed (${listSkillDirs().length} skills).`);
}
