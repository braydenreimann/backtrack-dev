import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'lib', 'server/src'];
const ALLOWED_EVENT_LITERAL_FILES = new Set(['lib/contracts/socket.ts']);
const ALLOWED_ACK_LITERAL_FILES = new Set(['lib/contracts/socket.ts']);

const EVENT_LITERAL_PATTERN = /(['"`])((?:room|game|turn|player)\.[A-Za-z0-9._:-]+|kickPlayer|client:game\.[a-z]+)\1/g;
const ACK_CODE_LITERAL_PATTERN = /code\s*(?:===|!==)\s*['"]([A-Z_]+)['"]/g;
const LEGACY_IMPORT_PATTERN = /from\s+['"]@\/lib\/game-types['"]/g;

const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const gatherFiles = (dir) => {
  const fullDir = join(ROOT, dir);
  const entries = readdirSync(fullDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(fullDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...gatherFiles(relative(ROOT, fullPath)));
      continue;
    }
    if (SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(relative(ROOT, fullPath));
    }
  }
  return files;
};

const lineForIndex = (text, index) => text.slice(0, index).split('\n').length;

const addMatches = (violations, file, text, pattern, kind, allowedFiles) => {
  if (allowedFiles.has(file)) {
    return;
  }
  for (const match of text.matchAll(pattern)) {
    const line = lineForIndex(text, match.index ?? 0);
    const literal = match[0];
    violations.push({ file, line, kind, literal });
  }
};

const files = SCAN_DIRS.flatMap(gatherFiles);
const violations = [];

for (const file of files) {
  const fullPath = join(ROOT, file);
  if (!statSync(fullPath).isFile()) {
    continue;
  }
  const text = readFileSync(fullPath, 'utf8');
  addMatches(violations, file, text, EVENT_LITERAL_PATTERN, 'event-literal', ALLOWED_EVENT_LITERAL_FILES);
  addMatches(violations, file, text, ACK_CODE_LITERAL_PATTERN, 'ack-code-literal', ALLOWED_ACK_LITERAL_FILES);
  for (const match of text.matchAll(LEGACY_IMPORT_PATTERN)) {
    const line = lineForIndex(text, match.index ?? 0);
    violations.push({
      file,
      line,
      kind: 'legacy-import',
      literal: match[0],
    });
  }
}

if (violations.length > 0) {
  console.error('Contract drift detected. Move literals/types to lib/contracts.');
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} [${violation.kind}] ${violation.literal}`
    );
  }
  process.exit(1);
}

console.log('Contract drift check passed.');
