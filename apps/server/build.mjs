// Bundles the server (and the shared TypeScript package) into dist/index.js.
// Native/WASM dependencies stay external and are resolved from node_modules.
import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: { index: 'src/index.ts', migrate: 'src/db/migrate-cli.ts', seed: 'src/db/seed.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  alias: { '@dbfc/shared': '../../packages/shared/src/index.ts' },
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
await cp('drizzle', 'dist/drizzle', { recursive: true });
console.log('Server bundle written to apps/server/dist');
