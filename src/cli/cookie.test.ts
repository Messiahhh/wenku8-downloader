import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  removeUserCookie,
  resolveCookie,
  saveUserCookie,
  userConfigDirectory,
  userCookiePath,
  userDownloadsDirectory,
  userWorkspaceDirectory,
} from './cookie.js';

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

  it('falls back to user config cookie after default local file', async () => {
    const cwd = await createTemporaryDirectory();
    const home = await createTemporaryDirectory();
    await saveUserCookie('user-cookie', { home, platform: 'linux', env: {} });

    await expect(resolveCookie({ cwd, home, platform: 'linux', env: {} })).resolves.toBe(
      'user-cookie',
    );
  });

  it('prefers default local file over user config cookie', async () => {
    const cwd = await createTemporaryDirectory();
    const home = await createTemporaryDirectory();
    await writeFile(path.join(cwd, '.wenku8-cookie'), 'local-cookie', 'utf8');
    await saveUserCookie('user-cookie', { home, platform: 'linux', env: {} });

    await expect(resolveCookie({ cwd, home, platform: 'linux', env: {} })).resolves.toBe(
      'local-cookie',
    );
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

  it('saves normalized user cookie and removes it', async () => {
    const home = await createTemporaryDirectory();
    const file = await saveUserCookie('WENKU8_COOKIE="PHPSESSID=abc; uid=123"', {
      home,
      platform: 'linux',
      env: {},
    });

    await expect(readFile(file, 'utf8')).resolves.toBe('PHPSESSID=abc; uid=123\n');
    await removeUserCookie({ home, platform: 'linux', env: {} });
    await expect(
      resolveCookie({ cwd: await createTemporaryDirectory(), home, platform: 'linux', env: {} }),
    ).resolves.toBeUndefined();
  });

  it('uses platform-specific user config paths', () => {
    expect(userCookiePath({ home: '/home/me', platform: 'linux', env: {} })).toBe(
      '/home/me/.config/wenku8/cookie',
    );
    expect(
      userCookiePath({
        home: '/home/me',
        platform: 'linux',
        env: { XDG_CONFIG_HOME: '/tmp/config' },
      }),
    ).toBe('/tmp/config/wenku8/cookie');
    expect(userCookiePath({ home: '/Users/me', platform: 'darwin', env: {} })).toBe(
      '/Users/me/Library/Application Support/wenku8/cookie',
    );
    expect(
      userCookiePath({
        home: 'C:\\Users\\me',
        platform: 'win32',
        env: { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' },
      }),
    ).toBe(path.join('C:\\Users\\me\\AppData\\Roaming', 'wenku8', 'cookie'));
  });

  it('uses the same user directory for config, downloads and workspace', () => {
    const options = { home: '/Users/me', platform: 'darwin' as const, env: {} };

    expect(userConfigDirectory(options)).toBe('/Users/me/Library/Application Support/wenku8');
    expect(userDownloadsDirectory(options)).toBe(
      '/Users/me/Library/Application Support/wenku8/downloads',
    );
    expect(userWorkspaceDirectory(options)).toBe(
      '/Users/me/Library/Application Support/wenku8/workspace',
    );
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wenku8-cookie-'));
  temporaryDirectories.push(directory);
  return directory;
}
