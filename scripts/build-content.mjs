import { readFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

const outputDirectory = process.argv[2] || 'dist';
const mode = process.argv[3] || 'production';
const outputFile = resolve(outputDirectory, 'assets/content.js');

await build({
  entryPoints: [resolve('src/content/index.ts')],
  outfile: outputFile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120', 'edge120'],
  jsx: 'automatic',
  minify: mode === 'production',
  sourcemap: false,
  legalComments: 'none',
  define: {
    'import.meta.env.DEV': JSON.stringify(mode !== 'production'),
    'import.meta.env.PROD': JSON.stringify(mode === 'production'),
    'import.meta.env.MODE': JSON.stringify(mode),
  },
});

const output = await readFile(outputFile, 'utf8');
if (/^\s*(?:import|export)\s/mu.test(output)) {
  throw new Error('Content Script must be a self-contained classic script.');
}

// Keep notices with every distributable build, including minified React code.
await Promise.all([
  ...['LICENSE', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md'].map((file) =>
    copyFile(resolve(file), resolve(outputDirectory, file))),
  copyFile(resolve('node_modules/react/LICENSE'), resolve(outputDirectory, 'REACT-LICENSE.txt')),
  copyFile(resolve('node_modules/react-dom/LICENSE'), resolve(outputDirectory, 'REACT-DOM-LICENSE.txt')),
]);
