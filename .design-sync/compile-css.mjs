#!/usr/bin/env node
// design-sync CSS compile step.
// Tailwind v4's app stylesheet (app/globals.css) ships only `@import
// "tailwindcss"` + `@theme` — the utility classes are generated at build time.
// The design-sync styles closure needs the COMPILED utilities, so we run the
// Tailwind CLI over the repo (it auto-scans components/ + .design-sync/previews/)
// and prepend the brand fonts (loaded by next/font in the app, absent here)
// as a Google-Fonts @import + the CSS-variable bindings the @theme expects.
// Output: ds-tailwind.css (gitignored, regenerated). cfg.cssEntry points at it.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const OUT = 'ds-tailwind.css';
const TMP = 'ds-tailwind.tmp.css';

// @import MUST precede all other rules, so the font block is prepended.
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&family=Manrope:wght@200..800&family=Geist+Mono:wght@100..900&display=swap');
:root {
  --font-jakarta: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --font-manrope: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --font-geist-mono: 'Geist Mono', ui-monospace, monospace;
}
`;

execSync(`npx @tailwindcss/cli -i app/globals.css -o ${TMP}`, { stdio: 'inherit' });
const compiled = readFileSync(TMP, 'utf8');
writeFileSync(OUT, FONTS + compiled);
rmSync(TMP, { force: true });
console.error(`✓ ${OUT}: fonts + ${compiled.split('\n').length} lines of compiled Tailwind`);
