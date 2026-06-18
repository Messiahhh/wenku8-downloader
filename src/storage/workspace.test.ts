import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestSchema } from './schema.js';
import { BookWorkspace } from './workspace.js';

describe('BookWorkspace', () => {
  it('serializes concurrent manifest updates without losing resources', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wenku8-workspace-'));
    const workspace = await BookWorkspace.open(root, 42);
    await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        workspace.mark(`chapter:${index}`, {
          kind: 'chapter',
          state: 'complete',
          attempts: 1,
          relativePath: `chapters/${index}.json`,
        }),
      ),
    );
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(path.join(root, '42', 'manifest.json'), 'utf8')),
    );
    expect(Object.keys(manifest.resources)).toHaveLength(30);
  });
});
