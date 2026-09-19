import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : ['.ts', '.tsx', '.css'].includes(extname(entry.name))
        ? [path]
        : [];
  });
}

test('production source contains no executable HTML injection or dynamic code evaluation', () => {
  const source = sourceFiles(fileURLToPath(new URL('../src', import.meta.url)))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|insertAdjacentHTML|\.innerHTML\s*=|\.outerHTML\s*=/u);
  assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b/u);
  assert.doesNotMatch(source, /console\.(?:log|debug)\s*\([^\n]*apiKey/iu);
});

test('manifest keeps the audited minimum permissions and strict MV3 CSP', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'),
  ) as {
    manifest_version: number;
    permissions: string[];
    host_permissions: string[];
    content_security_policy: { extension_pages: string };
  };
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['contextMenus', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://api.deepseek.com/*']);
  assert.equal(
    manifest.content_security_policy.extension_pages,
    "script-src 'self'; object-src 'self'",
  );
});
