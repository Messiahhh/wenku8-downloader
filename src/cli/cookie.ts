import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_COOKIE_FILE = '.wenku8-cookie';

export interface CookieOptions {
  cookie?: string;
  cookieFile?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export async function resolveCookie(options: CookieOptions = {}): Promise<string | undefined> {
  if (options.cookie?.trim()) return options.cookie.trim();

  const env = options.env ?? process.env;
  if (env.WENKU8_COOKIE?.trim()) return env.WENKU8_COOKIE.trim();

  const cwd = options.cwd ?? process.cwd();
  if (options.cookieFile?.trim()) {
    return readCookieFile(path.resolve(cwd, options.cookieFile), true);
  }

  return readCookieFile(path.resolve(cwd, DEFAULT_COOKIE_FILE), false);
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
