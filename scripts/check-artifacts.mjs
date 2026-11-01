// Blocks run artifacts and unexpected files from being committed.
// A second barrier behind .gitignore (which `git add -f` bypasses).
//
// Usage:
//   node scripts/check-artifacts.mjs            # staged files (pre-commit)
//   node scripts/check-artifacts.mjs --all      # all tracked files (CI)
//   node scripts/check-artifacts.mjs <path...>  # explicit paths

import { pathToFileURL } from 'node:url';
import { git } from './lib/repo.mjs';

// Every versioned path must live under one of these. Anything else is
// suspicious by default; extend the list deliberately when the repo grows.
const ALLOWED_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'README.pt-BR.md', 'CONTRIBUTING.md', 'LICENSE', 'package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', '.gitattributes', 'workspace/README.md'];
const ALLOWED_ROOT_DIRS = ['app/', 'desktop/', 'ide/', 'activities/', 'agents/', 'claude-agents/', 'core/', 'skills/', '.agents/skills/', '.claude/skills/', '.claude/agents/', 'adapters/', 'templates/', 'schemas/', 'examples/', 'docs/', 'scripts/', 'tests/', '.githooks/', '.github/'];
const ARTIFACT_EXTENSIONS = /\.(pdf|xlsx?|xlsm|docx?|pptx?|odt|ods|png|jpe?g|gif|webp|bmp|mp4|webm|mov|zip|7z|rar|tar|gz|har|trace|db|sqlite|pcap)$/i;
// Binary templates/images are only legitimate as skill assets, app artwork or doc images.
const BINARY_ALLOWED = [/^app\/public\//,/^skills\/[^/]+\/assets\//, /^\.agents\/skills\/[^/]+\/assets\//, /^\.claude\/skills\/[^/]+\/assets\//, /^docs\/assets\//];

export function findViolations(paths) {
  const violations = [];
  for (const raw of paths) {
    const path = raw.replace(/\\/g, '/');
    const name = path.split('/').pop();
    if ((path.startsWith('workspace/') && path !== 'workspace/README.md') || path.startsWith('workspaces/')) {
      violations.push(`${path}: workspace/ content is never versioned (artifact isolation policy)`);
    } else if (path.startsWith('dist/') || path.startsWith('app/dist/') || path.startsWith('app/dist-electron/') || path.startsWith('release/') || path.startsWith('build/')) {
      violations.push(`${path}: dist/ holds generated bundles and is never versioned`);
    } else if (/^\.env(\..*)?$/.test(name)) {
      violations.push(`${path}: environment files may contain credentials`);
    } else if (ARTIFACT_EXTENSIONS.test(path) && !BINARY_ALLOWED.some((re) => re.test(path))) {
      violations.push(`${path}: looks like a run artifact (binary/document/evidence); only skill assets may be binary`);
    } else if (/\.log$/i.test(path) && !path.startsWith('examples/')) {
      violations.push(`${path}: log files belong in workspace/runs/<run-id>/logs/`);
    } else if (!ALLOWED_ROOT_FILES.includes(path) && !ALLOWED_ROOT_DIRS.some((d) => path.startsWith(d))) {
      violations.push(`${path}: unexpected location; framework files live in ${ALLOWED_ROOT_DIRS.join(' ')} (update scripts/check-artifacts.mjs if intentional)`);
    }
  }
  return violations;
}

function listPaths(argv) {
  if (argv.includes('--all')) return git(['ls-files']).split('\n').filter(Boolean);
  if (argv.length) return argv;
  return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']).split('\n').filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = findViolations(listPaths(process.argv.slice(2)));
  if (violations.length) {
    console.error('Artifact check failed — these files must not be versioned:');
    violations.forEach((v) => console.error(`  - ${v}`));
    console.error('Move run files to workspace/ (ignored by Git). See docs/privacy-and-isolation.md.');
    process.exit(1);
  }
  console.log('Artifact check passed.');
}
