import { describe, expect, it } from 'vitest';
import { createOpenApiDocument } from '../src/docs/openapi.js';

describe('createOpenApiDocument', () => {
  it('provides complete privacy-safe Scalar client examples', () => {
    const document = createOpenApiDocument([], {
      origin: 'http://rpi.local:8081',
    });
    const examples = document.info['x-scalar-sdk-installation'];

    expect(examples.map(({ lang }) => lang)).toEqual([
      'shell',
      'ruby',
      'node',
      'php',
      'python',
    ]);
    expect(
      examples.every(({ source }) =>
        source.includes('http://rpi.local:8081/health'),
      ),
    ).toBe(true);
    expect(
      examples.every(({ source }) => source.includes('OPENWA_API_KEY')),
    ).toBe(true);
    expect(JSON.stringify(examples)).not.toContain('X-API-Key: e5ac');
  });
});
