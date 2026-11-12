// Bundles the Express backend into dist/server.cjs (`npm start` / Render: `node dist/server.cjs`).
//
// Skipped on Vercel (VERCEL=1): Vercel only hosts the static frontend, and everything inside the
// output directory (dist/) is publicly downloadable, so the backend bundle and its source map must
// not be deployed there.
import { build } from 'esbuild';

if (process.env.VERCEL) {
  console.log('[build-server] VERCEL detected: skipping backend bundle so it is not published as a static asset.');
} else {
  await build({
    entryPoints: ['server.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    sourcemap: true,
    outfile: 'dist/server.cjs',
    logLevel: 'info',
  });
}
