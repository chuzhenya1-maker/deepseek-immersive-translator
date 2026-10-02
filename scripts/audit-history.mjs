// Read-only scan; print locations and pattern names, never matched secrets.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

const git = (...args) => execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const patterns = [
  ['API token', /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ['credential URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/u],
];
const commits = git('rev-list', '--all').trim().split('\n').filter(Boolean);
let blobs = 0;
const findings = [];
for (const line of git('rev-list', '--objects', '--all').trim().split('\n')) {
  const [sha, ...parts] = line.split(' ');
  const path = parts.join(' ');
  if (git('cat-file', '-t', sha).trim() !== 'blob') continue;
  blobs++;
  const content = git('cat-file', 'blob', sha);
  for (const [name, pattern] of patterns) {
    if (pattern.test(content)) findings.push({ sha: sha.slice(0, 12), path, pattern: name });
  }
  if (/(^|\/)(\.env(?:\..+)?|id_rsa|id_ed25519)$|\.(?:pem|p12|pfx)$/iu.test(path)) {
    findings.push({ sha: sha.slice(0, 12), path, pattern: 'sensitive filename' });
  }
}
console.log(JSON.stringify({ commits: commits.length, uniqueBlobs: blobs, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;
