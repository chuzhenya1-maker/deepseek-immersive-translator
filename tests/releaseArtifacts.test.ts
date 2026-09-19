import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('package and manifest versions match and all extension icons are valid PNG sizes', () => {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { name: string; version: string };
  const manifest = JSON.parse(
    readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'),
  ) as { name: string; version: string; icons: Record<string, string> };

  assert.equal(packageJson.version, manifest.version);
  assert.equal(manifest.name, 'DeepSeek Immersive Translator');
  for (const size of [16, 32, 48, 128]) {
    assert.equal(manifest.icons[String(size)], `icons/icon${size}.png`);
    const png = readFileSync(
      new URL(`../public/icons/icon${size}.png`, import.meta.url),
    );
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
