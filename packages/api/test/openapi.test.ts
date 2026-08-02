import { describe, expect, it } from 'vitest';
import { createOpenApiDocument } from '../src/docs/openapi.js';

describe('createOpenApiDocument', () => {
  it('provides complete privacy-safe Scalar client examples', () => {
    const document = createOpenApiDocument([], {
      origin: 'http://rpi.local:8081',
    });
    const examples = document.info['x-scalar-sdk-installation'];

    expect(examples.map(({ lang }) => lang)).toEqual([
      'c',
      'clojure',
      'csharp',
      'dart',
      'fsharp',
      'go',
      'http',
      'java',
      'js',
      'kotlin',
      'shell',
      'ruby',
      'node',
      'objc',
      'ocaml',
      'php',
      'powershell',
      'python',
      'r',
      'rust',
      'swift',
    ]);
    expect(examples.every(({ source }) => source.includes('/health'))).toBe(
      true,
    );
    expect(
      examples.every(({ source }) => source.includes('rpi.local:8081')),
    ).toBe(true);
    expect(
      examples.every(({ source }) => source.includes('OPENWA_API_KEY')),
    ).toBe(true);
    expect(JSON.stringify(examples)).not.toContain('X-API-Key: e5ac');
  });
});
