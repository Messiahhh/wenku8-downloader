import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_COOKIE_FILE = '.wenku8-cookie';
const APP_NAME = 'wenku8';
const USER_COOKIE_FILE = 'cookie';

export interface CookieOptions extends UserCookieOptions {
  cookie?: string;
  cookieFile?: string;
  cwd?: string;
}

export interface UserCookieOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  platform?: NodeJS.Platform;
}

export async function resolveCookie(options: CookieOptions = {}): Promise<string | undefined> {
  if (options.cookie?.trim()) return options.cookie.trim();

  const env = options.env ?? process.env;
  if (env.WENKU8_COOKIE?.trim()) return env.WENKU8_COOKIE.trim();

  const cwd = options.cwd ?? process.cwd();
  if (options.cookieFile?.trim()) {
    return readCookieFile(path.resolve(cwd, options.cookieFile), true);
  }

  return (
    (await readCookieFile(path.resolve(cwd, DEFAULT_COOKIE_FILE), false)) ??
    (await readCookieFile(userCookiePath(options), false))
  );
}

export async function saveUserCookie(cookie: string, options: UserCookieOptions = {}): Promise<string> {
  const parsed = parseCookieContent(cookie);
  if (!parsed) throw new Error('Cookie 为空或格式无效');
  const file = userCookiePath(options);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${parsed}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(file, 0o600).catch(() => undefined);
  return file;
}

export async function removeUserCookie(options: UserCookieOptions = {}): Promise<string> {
  const file = userCookiePath(options);
  await rm(file, { force: true });
  return file;
}

export function userCookiePath(options: UserCookieOptions = {}): string {
  return path.join(userConfigDirectory(options), USER_COOKIE_FILE);
}

export function userDownloadsDirectory(options: UserCookieOptions = {}): string {
  return path.join(userConfigDirectory(options), 'downloads');
}

export function userWorkspaceDirectory(options: UserCookieOptions = {}): string {
  return path.join(userConfigDirectory(options), 'workspace');
}

export function userConfigDirectory(options: UserCookieOptions = {}): string {
  const env = options.env ?? process.env;
  const home = options.home ?? os.homedir();
  const platform = options.platform ?? process.platform;
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', APP_NAME);
  if (platform === 'win32') {
    return path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), APP_NAME);
  }
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), APP_NAME);
}

async function readCookieFile(file: string, required: boolean): Promise<string | undefined> {
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if (!required && isNotFound(error)) return undefined;
    throw new Error(`无法读取 Cookie 文件：${file}`);
  }

  const cookie = parseCookieContent(content);
  if (!cookie && required) throw new Error(`Cookie 文件为空或格式无效：${file}`);
  return cookie;
}

function parseCookieContent(content: string): string | undefined {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const envLine = lines.find((line) => line.startsWith('WENKU8_COOKIE='));
  if (envLine) return stripQuotes(envLine.slice('WENKU8_COOKIE='.length).trim());

  return lines.length === 0 ? undefined : lines.join(' ');
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
