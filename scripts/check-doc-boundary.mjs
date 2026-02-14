import { execSync } from 'child_process';
import { existsSync } from 'fs';

const ALLOWED_ROOT_DOC_FILES = new Set(['README.md', 'AGENTS.md', 'GEMINI.md']);
const DOC_EXTENSIONS = ['.md', '.MD', '.html', '.HTML'];

const gitFiles = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const isDocFile = (path) => DOC_EXTENSIONS.some((ext) => path.endsWith(ext));

const violations = [];

for (const file of gitFiles) {
  if (!existsSync(file)) {
    continue;
  }
  if (!isDocFile(file)) {
    continue;
  }

  const isAllowedRoot = ALLOWED_ROOT_DOC_FILES.has(file);
  const isHumanDoc = file.startsWith('human-docs/');
  const isAgentDoc = file.startsWith('agent-docs/');
  const isDeprecatedDocsPath = file.startsWith('docs/');

  if (isDeprecatedDocsPath) {
    violations.push(`${file} [deprecated docs/ path]`);
    continue;
  }

  if (!isAllowedRoot && !isHumanDoc && !isAgentDoc) {
    violations.push(`${file} [outside allowed doc roots]`);
  }
}

if (violations.length > 0) {
  console.error('Documentation boundary check failed.');
  console.error('Doc files must be in README.md, AGENTS.md, GEMINI.md, human-docs/**, or agent-docs/**.');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Documentation boundary check passed.');
