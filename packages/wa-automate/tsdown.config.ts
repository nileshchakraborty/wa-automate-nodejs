import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: './src/index.ts',
    cli: './src/cli.ts',
    'multi-session': './src/multi-session.ts',
  },
  format: ['cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
