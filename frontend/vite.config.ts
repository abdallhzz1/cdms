import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vitest options live in this file (rather than a separate vitest.config.ts),
 * so the exported object carries a `test` key that Vite's own `UserConfig`
 * does not declare. The two usual ways of typing that both fail here, for the
 * same underlying reason:
 *
 *   - `/// <reference types="vitest/config" />` — Vitest's module
 *     augmentation targets the Vite copy *it* resolves, not the one this
 *     project builds with, so the augmentation never reaches the `UserConfig`
 *     actually in play. `tsc -b` then rejects `test` with TS2769.
 *   - `import { defineConfig } from 'vitest/config'` — pulls in that other
 *     Vite copy's types wholesale, which makes every plugin structurally
 *     incompatible (`Plugin<any>` vs `Plugin<any>` from two module paths).
 *
 * The cause is a real duplicate install, not a typo: this project is on
 * vite@6, while vitest@2.1 peer-depends on vite@5 and so gets its own nested
 * copy. Both type errors disappear the day Vitest is upgraded to a release
 * that shares vite@6 — that is a dependency decision, not a config one, so it
 * is deliberately left alone here.
 *
 * Declaring the shape locally sidesteps the cross-copy conflict entirely and
 * keeps the four options actually used type-checked. Vitest reads this config
 * at runtime regardless of how it is typed, so no test or build behavior
 * changes.
 */
type VitestOptions = {
  environment: string;
  setupFiles: string[];
  globals: boolean;
  css: boolean;
};

// Typed as a variable rather than passed straight to defineConfig(): the
// excess-property check that would reject `test` only fires on an object
// literal used directly as an argument.
const config: UserConfig & { test: VitestOptions } = {
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirrors the "@/*" -> "./src/*" mapping in tsconfig.app.json. TypeScript's
    // `paths` only affects the type checker — it does NOT make Vite/Vitest
    // resolve the alias at build/dev/test time, so both have to be declared.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: true,
  },
};

// https://vite.dev/config/
export default defineConfig(config);
