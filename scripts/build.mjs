// Bundles the extension's entry points into dist/ and copies static files.
import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';

const ENTRIES = {
  background: 'src/background/index.ts',
  content: 'src/content/index.ts',
};

try {
  await rm('dist', { recursive: true, force: true });
  await build({
    entryPoints: ENTRIES,
    outdir: 'dist',
    bundle: true,
    format: 'iife',
    target: 'safari16',
    logLevel: 'warning',
  });
  await cp('static', 'dist', { recursive: true });
  console.log('built dist/');
} catch (error) {
  console.error(error);
  process.exit(1);
}
