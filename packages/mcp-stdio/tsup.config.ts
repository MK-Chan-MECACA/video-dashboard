import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Bundle the workspace-only tool definitions so the published package is self-contained.
  noExternal: ['@vd/shared'],
});
