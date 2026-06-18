import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCookie } from './cookie.js';

const temporaryDirectories: string[] = [];

describe('resolveCookie', () => {
  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  it('prefers explicit cookie over env and file', async () => {
    const cwd = await createTemporaryDirectory();
    await writeFile(path.join(cwd, '.wenku8-cookie'), 'file-cookie', 'utf8');

    await expect(
      resolveCookie({
        cookie: 'explicit-cookie',
        cwd,
        env: { WENKU8_COOKIE: 'env-cookie' },
      }),
    ).resolves.toBe('explicit-cookie');
  });

  it('prefers env cookie over default local file', async () => {
    const cwd = await createTemporaryDirectory();
    await writeFile(path.join(cwd, '.wenku8-cookie'), 'file-cookie', 'utf8');

    await expect(resolveCookie({ cwd, env: { WENKU8_COOKIE: 'env-cookie' } })).resolves.toBe(
      'env-cookie',
    );
  });

  it('reads raw cookie from default local file', async () => {
    const cwd = await createTemporaryDirectory();
    await writeFile(path.join(cwd, '.wenku8-cookie'), 'PHPSESSID=abc; uid=123', 'utf8');

    await expect(resolveCookie({ cwd, env: {} })).resolves.toBe('PHPSESSID=abc; uid=123');
  });

  it('reads env-style cookie files', async () => {
    const cwd = await createTemporaryDirectory();
    await writeFile(
      path.join(cwd, 'credentials.local'),
      '# local credential\nWENKU8_COOKIE="PHPSESSID=abc; uid=123"\n',
      'utf8',
    );

    await expect(resolveCookie({ cwd, cookieFile: 'credentials.local', env: {} })).resolves.toBe(
      'PHPSESSID=abc; uid=123',
    );
  });

  it('fails when an explicit cookie file is missing', async () => {
    const cwd = await createTemporaryDirectory();

    await expect(resolveCookie({ cwd, cookieFile: 'missing.cookie', env: {} })).rejects.toThrow(
      '无法读取 Cookie 文件',
    );
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wenku8-cookie-'));
  temporaryDirectories.push(directory);
  return directory;
}
