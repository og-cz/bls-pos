// Writes the next CHANGELOG.md section from Conventional Commits (Section 11), from the
// last tag (or the first commit) to HEAD. Usage: `pnpm changelog 1.0.0-rc.1`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) throw new Error('Usage: node scripts/changelog.mjs <version>');

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let lastTag = '';
try {
  lastTag = git('describe', '--tags', '--abbrev=0');
} catch {
  // No tags yet: start from the beginning.
}
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
const lines = git('log', range, '--reverse', '--format=%h%x09%s').split('\n').filter(Boolean);

const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['test', 'Tests'],
  ['docs', 'Documentation'],
];
const groups = new Map(SECTIONS.map(([type]) => [type, []]));
const other = [];
for (const line of lines) {
  const [hash, subject] = line.split('\t');
  const m = /^(\w+)(?:\(([^)]+)\))?!?: (.+)$/.exec(subject ?? '');
  if (!m) continue; // e.g. "Initial commit"
  const [, type, scope, text] = m;
  const entry = `- ${scope ? `**${scope}:** ` : ''}${text} (${hash})`;
  (groups.get(type) ?? other).push(entry);
}

const date = new Date().toISOString().slice(0, 10);
let section = `## ${version} — ${date}\n`;
for (const [type, title] of SECTIONS) {
  const items = groups.get(type) ?? [];
  if (items.length) section += `\n### ${title}\n\n${items.join('\n')}\n`;
}
if (other.length) section += `\n### Maintenance\n\n${other.join('\n')}\n`;

const header =
  '# Changelog\n\nAll notable changes, newest first. Generated from Conventional Commits by\n`scripts/changelog.mjs`; the summary under each version is written by hand.\n';
const previous = existsSync('CHANGELOG.md')
  ? readFileSync('CHANGELOG.md', 'utf8').replace(header, '').trim()
  : '';
writeFileSync('CHANGELOG.md', `${header}\n${section}${previous ? `\n${previous}\n` : ''}`);
console.log(`CHANGELOG.md: ${String(lines.length)} commits for ${version}`);
