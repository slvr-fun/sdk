import { defineConfig } from 'tsup';

// Dual ESM + CJS build with type declarations. viem stays external (peer dep).
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  outDir: 'dist',
});
