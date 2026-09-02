// Build/dev-server script for the QuantPulse client, using esbuild directly
// instead of a heavier bundler config — fast, and the whole pipeline fits in
// one readable file.
import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync, watch } from 'node:fs';

const isServe = process.argv.includes('--serve');
const isProd = !isServe;
const DEV_PORT = 5173;
const API_BASE = isProd ? '' : 'http://localhost:4000';

mkdirSync('dist', { recursive: true });

const ctx = await esbuild.context({
  entryPoints: ['src/main.jsx'],
  outfile: 'dist/bundle.js',
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  minify: isProd,
  sourcemap: isProd ? true : 'inline',
  target: ['es2020'],
  define: {
    'process.env.API_BASE': JSON.stringify(API_BASE),
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
  },
  logLevel: 'info',
});

const LIVE_RELOAD_SNIPPET = `<script>
  new EventSource('/esbuild').addEventListener('change', () => location.reload());
</script>`;

function copyStatic() {
  let html = readFileSync('index.html', 'utf8');
  if (isServe) html = html.replace('</body>', `${LIVE_RELOAD_SNIPPET}\n</body>`);
  writeFileSync('dist/index.html', html);
  copyFileSync('src/styles.css', 'dist/styles.css');
}

if (isServe) {
  copyStatic();
  // esbuild's watcher only tracks the JS/JSX module graph, so index.html and
  // styles.css (plain copies, not bundled) need their own watch to pick up
  // edits during `npm run dev`.
  watch('index.html', copyStatic);
  watch('src/styles.css', copyStatic);

  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: DEV_PORT });
  console.log(`\nQuantPulse dev server → http://localhost:${port}`);
  console.log(`Expecting the API at ${API_BASE} (run "npm run dev" in /server)\n`);
} else {
  await ctx.rebuild();
  copyStatic();
  await ctx.dispose();
  console.log('Build complete → client/dist');
}
