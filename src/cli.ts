#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { input, password, select } from '@inquirer/prompts';
import { Command } from 'commander';
import { Listr } from 'listr2';
import { Downloader } from './service/downloader.js';
import { Wenku8Client, type SugoiYear, type ToplistSort } from './site/client.js';
import { parseBookReference } from './domain/ids.js';
import { commandAvailable, runEpubCheck } from './cli/epubcheck.js';
import { manifestSchema } from './storage/schema.js';
import {
  removeUserCookie,
  resolveCookie,
  saveUserCookie,
  userConfigDirectory,
  userCookiePath,
  userDownloadsDirectory,
  userWorkspaceDirectory,
} from './cli/cookie.js';
import {
  printBookInfo,
  printDoctorStatus,
  printDownloadSummary,
  printHttpStats,
  printSearchResults,
  printStatus,
  formatProgress,
  formatHttpRetry,
} from './cli/ui.js';
import type { Book } from './domain/book.js';
import type { HttpRetryEvent } from './http/client.js';

const VERSION = '5.1.0';
const BACK = '__back__';
const EXIT = '__exit__';
const TOPLISTS: Array<{ name: string; value: ToplistSort; aliases: string[] }> = [
  { name: '今日热榜', value: 'dayvisit', aliases: ['day', 'today', 'dayvisit'] },
  { name: '本月热点', value: 'monthvisit', aliases: ['month', 'monthvisit'] },
  { name: '热门轻小说', value: 'allvisit', aliases: ['all', 'hot', 'allvisit'] },
  { name: '最受关注', value: 'goodnum', aliases: ['good', 'follow', 'goodnum'] },
  { name: '新书一览', value: 'postdate', aliases: ['new', 'postdate'] },
];
const SUGOI_YEARS = Array.from({ length: 22 }, (_value, index) => 2026 - index) as SugoiYear[];
const DEFAULT_OUTPUT_DIRECTORY = userDownloadsDirectory();
const DEFAULT_WORK_DIRECTORY = userWorkspaceDirectory();
const program = new Command();

program.name('wenku8').description('可恢复、图片完整性优先的轻小说 EPUB 下载器').version(VERSION);

program
  .command('login')
  .description('保存站点 Cookie 到用户配置目录')
  .option('--cookie <value>', '直接传入站点 Cookie')
  .option('--cookie-file <file>', '从文件读取 Cookie')
  .action(async (options: CredentialCliOptions) => {
    const cookie = await readLoginCookie(options);
    const file = await saveUserCookie(cookie);
    console.log(`Cookie 已保存：${file}`);
  });

program
  .command('logout')
  .description('删除用户配置目录中的 Cookie')
  .action(async () => {
    const file = await removeUserCookie();
    console.log(`Cookie 已删除：${file}`);
  });

program
  .command('config')
  .description('显示用户配置路径')
  .action(() => {
    console.log(`配置目录：${userConfigDirectory()}`);
    console.log(`Cookie 文件：${userCookiePath()}`);
    console.log(`EPUB 输出目录：${DEFAULT_OUTPUT_DIRECTORY}`);
    console.log(`工作区目录：${DEFAULT_WORK_DIRECTORY}`);
  });

program
  .command('search')
  .description('按小说名或作者搜索')
  .argument('<keyword>', '搜索关键词')
  .option('--author', '按作者搜索')
  .option('--download', '从搜索结果中选择一本并下载')
  .option('-o, --output <directory>', 'EPUB 输出目录', DEFAULT_OUTPUT_DIRECTORY)
  .option('-w, --work-dir <directory>', '工作区目录', DEFAULT_WORK_DIRECTORY)
  .option('-c, --concurrency <number>', '网络并发数', parsePositiveInteger, 3)
  .option('-r, --rate-limit <number>', '每秒最多请求数', parsePositiveInteger, 1)
  .option('--chapter-retry-rounds <number>', '章节失败后的整轮自动重试次数', parseNonNegativeInteger, 2)
  .option('--chapter-retry-delay <ms>', '章节自动重试轮次之间的等待毫秒数', parseNonNegativeInteger, 15_000)
  .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
  .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
  .option('--allow-missing-images', '允许生成缺图 EPUB')
  .option('--http-stats', '打印 HTTP 传输统计')
  .option('--verbose-progress', '显示每个章节的详细进度日志')
  .action(async (keyword: string, options: SearchCliOptions) => {
    const results = await (
      await createClient(options)
    ).search(keyword, options.author ? 'author' : 'articlename');
    printSearchResults(results);
    if (options.download && results.length > 0) {
      const selected = await select({
        message: '选择要下载的小说',
        choices: results.map((result) => ({
          name: `${result.id}  ${result.title}${result.author ? ` - ${result.author}` : ''}`,
          value: result.id,
        })),
      });
      await runDownload(selected, options);
    }
  });

program
  .command('toplist')
  .description('查看热门榜单')
  .argument('[list]', '榜单：day/month/all/good/new', 'day')
  .option('--download', '从榜单结果中选择一本并下载')
  .option('-o, --output <directory>', 'EPUB 输出目录', DEFAULT_OUTPUT_DIRECTORY)
  .option('-w, --work-dir <directory>', '工作区目录', DEFAULT_WORK_DIRECTORY)
  .option('-c, --concurrency <number>', '网络并发数', parsePositiveInteger, 3)
  .option('-r, --rate-limit <number>', '每秒最多请求数', parsePositiveInteger, 1)
  .option('--chapter-retry-rounds <number>', '章节失败后的整轮自动重试次数', parseNonNegativeInteger, 2)
  .option('--chapter-retry-delay <ms>', '章节自动重试轮次之间的等待毫秒数', parseNonNegativeInteger, 15_000)
  .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
  .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
  .option('--allow-missing-images', '允许生成缺图 EPUB')
  .option('--http-stats', '打印 HTTP 传输统计')
  .option('--verbose-progress', '显示每个章节的详细进度日志')
  .action(async (list: string, options: ToplistCliOptions) => {
    const sort = parseToplistSort(list);
    const results = await (await createClient(options)).toplist(sort);
    printSearchResults(results);
    if (options.download && results.length > 0) {
      const selected = await selectBookFromResults(results);
      if (selected !== BACK) await runDownload(selected, options);
    }
  });

program
  .command('sugoi')
  .description('查看这本轻小说真厉害榜单')
  .argument('[year]', '年份：2026 到 2005', '2026')
  .option('--download', '从榜单结果中选择一本并下载')
  .option('-o, --output <directory>', 'EPUB 输出目录', DEFAULT_OUTPUT_DIRECTORY)
  .option('-w, --work-dir <directory>', '工作区目录', DEFAULT_WORK_DIRECTORY)
  .option('-c, --concurrency <number>', '网络并发数', parsePositiveInteger, 3)
  .option('-r, --rate-limit <number>', '每秒最多请求数', parsePositiveInteger, 1)
  .option('--chapter-retry-rounds <number>', '章节失败后的整轮自动重试次数', parseNonNegativeInteger, 2)
  .option('--chapter-retry-delay <ms>', '章节自动重试轮次之间的等待毫秒数', parseNonNegativeInteger, 15_000)
  .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
  .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
  .option('--allow-missing-images', '允许生成缺图 EPUB')
  .option('--http-stats', '打印 HTTP 传输统计')
  .option('--verbose-progress', '显示每个章节的详细进度日志')
  .action(async (year: string, options: SugoiCliOptions) => {
    const results = await (await createClient(options)).sugoi(parseSugoiYear(year));
    printSearchResults(results);
    if (options.download && results.length > 0) {
      const selected = await selectBookFromResults(results);
      if (selected !== BACK) await runDownload(selected, options);
    }
  });

program
  .command('info')
  .description('显示小说元数据')
  .argument('<book>', '小说 ID 或详情页 URL')
  .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
  .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
  .option('--json', '输出原始 JSON')
  .action(async (reference: string, options: InfoCliOptions) => {
    const { book } = await (await createClient(options)).getBookDetails(parseBookReference(reference));
    if (options.json) {
      console.log(JSON.stringify(book, null, 2));
      return;
    }
    printBookInfo(book);
  });

const addDownloadCommand = (name: 'download' | 'resume') =>
  program
    .command(name)
    .description(name === 'download' ? '下载小说并生成 EPUB' : '继续未完成的下载')
    .argument('<book>', '小说 ID 或详情页 URL')
    .option('-o, --output <directory>', 'EPUB 输出目录', DEFAULT_OUTPUT_DIRECTORY)
    .option('-w, --work-dir <directory>', '工作区目录', DEFAULT_WORK_DIRECTORY)
    .option('-c, --concurrency <number>', '网络并发数', parsePositiveInteger, 3)
    .option('-r, --rate-limit <number>', '每秒最多请求数', parsePositiveInteger, 1)
    .option('--chapter-retry-rounds <number>', '章节失败后的整轮自动重试次数', parseNonNegativeInteger, 2)
    .option('--chapter-retry-delay <ms>', '章节自动重试轮次之间的等待毫秒数', parseNonNegativeInteger, 15_000)
    .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
    .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
    .option('--allow-missing-images', '允许生成缺图 EPUB')
    .option('--http-stats', '打印 HTTP 传输统计')
    .option('--verbose-progress', '显示每个章节的详细进度日志')
    .action(async (reference: string, options: DownloadCliOptions) => {
      await runDownload(reference, options);
    });

addDownloadCommand('download');
addDownloadCommand('resume');

program
  .command('status')
  .description('查看下载工作区状态')
  .argument('<book>', '小说 ID')
  .option('-w, --work-dir <directory>', '工作区目录', DEFAULT_WORK_DIRECTORY)
  .option('--json', '输出原始 JSON')
  .action(async (reference: string, options: { workDir: string; json?: boolean }) => {
    const status = await readWorkspaceStatus(reference, options.workDir);
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    printStatus(status);
  });

program
  .command('validate')
  .description('使用官方 EPUBCheck 校验 EPUB')
  .argument('<file>', 'EPUB 文件')
  .action(async (file: string) => runEpubCheck(path.resolve(file)));

program
  .command('doctor')
  .description('检查运行环境')
  .action(async () => {
    const epubcheck = await commandAvailable('epubcheck');
    const java = await commandAvailable('java', ['-version']);
    printDoctorStatus({ node: process.version, java, epubcheck });
  });

program.action(async () => interactive());

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function interactive(): Promise<void> {
  while (true) {
    const action = await select({
      message: '请选择操作',
      loop: false,
      choices: [
        { name: '搜索下载', value: 'search-download' },
        ...TOPLISTS.map((toplist) => ({ name: toplist.name, value: toplist.value })),
        { name: '轻小说大赏', value: 'sugoi' },
        { name: '检查环境', value: 'doctor' },
        { name: '退出', value: EXIT },
      ],
    });
    if (action === EXIT) return;
    if (action === 'doctor') {
      await interactiveDoctor();
      return;
    }
    if (action === 'search-download') {
      if (await interactiveSearchDownload()) return;
      continue;
    }
    if (isToplistSort(action)) {
      if (await interactiveToplist(action)) return;
      continue;
    }
    if (action === 'sugoi') {
      if (await interactiveSugoi()) return;
      continue;
    }
  }
}

interface CredentialCliOptions {
  cookie?: string;
  cookieFile?: string;
}

interface SearchCliOptions extends CredentialCliOptions {
  author?: boolean;
  download?: boolean;
  output: string;
  workDir: string;
  concurrency: number;
  rateLimit: number;
  chapterRetryRounds: number;
  chapterRetryDelay: number;
  allowMissingImages?: boolean;
  httpStats?: boolean;
  verboseProgress?: boolean;
}

interface ToplistCliOptions extends DownloadCliOptions {
  download?: boolean;
}

interface SugoiCliOptions extends DownloadCliOptions {
  download?: boolean;
}

interface InfoCliOptions extends CredentialCliOptions {
  json?: boolean;
}

interface DownloadCliOptions extends CredentialCliOptions {
  output: string;
  workDir: string;
  concurrency: number;
  rateLimit: number;
  chapterRetryRounds: number;
  chapterRetryDelay: number;
  allowMissingImages?: boolean;
  httpStats?: boolean;
  verboseProgress?: boolean;
}

async function readLoginCookie(options: CredentialCliOptions): Promise<string> {
  if (options.cookie?.trim()) return options.cookie.trim();
  if (options.cookieFile?.trim()) return readFile(path.resolve(options.cookieFile), 'utf8');
  return password({
    message: '粘贴 www.wenku8.net 域名下的完整 Cookie',
    mask: '*',
  });
}

async function createClient(
  options: Partial<DownloadCliOptions> = {},
  hooks: { onRetry?: (event: HttpRetryEvent) => void } = {},
): Promise<Wenku8Client> {
  const globalOptions = program.opts<CredentialCliOptions>();
  const cookieOptions: CredentialCliOptions = {};
  const cookie = options.cookie ?? globalOptions.cookie;
  const cookieFile = options.cookieFile ?? globalOptions.cookieFile;
  if (cookie !== undefined) cookieOptions.cookie = cookie;
  if (cookieFile !== undefined) cookieOptions.cookieFile = cookieFile;
  const resolvedCookie = await resolveCookie(cookieOptions);
  if (!resolvedCookie) throw new Error(missingCookieMessage());
  return new Wenku8Client({
    concurrency: options.concurrency ?? 3,
    requestsPerSecond: options.rateLimit ?? 1,
    preferCurl: true,
    cookie: resolvedCookie,
    ...(hooks.onRetry ? { onRetry: hooks.onRetry } : {}),
  });
}

async function interactiveDoctor(): Promise<void> {
  const epubcheck = await commandAvailable('epubcheck');
  const java = await commandAvailable('java', ['-version']);
  printDoctorStatus({ node: process.version, java, epubcheck });
}

async function interactiveSearchDownload(): Promise<boolean> {
  const type = await select({
    message: '搜索方式',
    loop: false,
    choices: [
      { name: '小说名（模糊搜索）', value: 'articlename' },
      { name: '作者名', value: 'author' },
      { name: '小说 ID', value: 'id' },
      { name: '返回上级', value: BACK },
    ],
  });
  if (type === BACK) return false;
  if (type === 'id') {
    const reference = await input({ message: '小说 ID 或详情页 URL（留空/q 返回上级）' });
    if (isBackInput(reference)) return false;
    return previewAndMaybeDownload(reference);
  }
  const keyword = await input({ message: '搜索关键词（留空/q 返回上级）' });
  if (isBackInput(keyword)) return false;
  const results = await (await createClient()).search(keyword, type);
  printSearchResults(results);
  if (results.length === 0) return true;
  const selected = await selectBookFromResults(results);
  if (selected === BACK) return false;
  return previewAndMaybeDownload(selected);
}

async function interactiveToplist(sort: ToplistSort): Promise<boolean> {
  const results = await (await createClient()).toplist(sort);
  printSearchResults(results);
  if (results.length === 0) return true;
  const selected = await selectBookFromResults(results);
  if (selected === BACK) return false;
  return previewAndMaybeDownload(selected);
}

async function interactiveSugoi(): Promise<boolean> {
  const year = await select({
    message: '选择年份',
    loop: false,
    choices: [
      ...SUGOI_YEARS.map((value) => ({ name: `${value} 年`, value: String(value) })),
      { name: '返回上级', value: BACK },
    ],
  });
  if (year === BACK) return false;
  const results = await (await createClient()).sugoi(parseSugoiYear(year));
  printSearchResults(results);
  if (results.length === 0) return true;
  const selected = await selectBookFromResults(results);
  if (selected === BACK) return false;
  return previewAndMaybeDownload(selected);
}

async function selectBookFromResults(results: Array<{ id: number; title: string; author?: string }>) {
  return select({
    message: '选择要下载的小说',
    loop: false,
    choices: [
      ...results.map((result) => ({
        name: `${result.id}  ${result.title}${result.author ? ` - ${result.author}` : ''}`,
        value: String(result.id),
      })),
      { name: '返回上级', value: BACK },
    ],
  });
}

async function previewAndMaybeDownload(reference: string | number): Promise<boolean> {
  const bookId = parseBookReference(String(reference));
  const { book } = await (await createClient()).getBookDetails(bookId);
  printBookInfo(book);
  const action = await select({
    message: '下一步',
    loop: false,
    choices: [
      { name: '下载这本书', value: 'download' },
      { name: '返回上级', value: BACK },
    ],
  });
  if (action === BACK) return false;
  await runDownload(bookId, {});
  return true;
}

async function readWorkspaceStatus(reference: string, workDir: string): Promise<{
  bookId: number;
  title?: string;
  updatedAt: string;
  counts: Record<string, number>;
}> {
  const id = parseBookReference(reference);
  const file = path.resolve(workDir, String(id), 'manifest.json');
  const manifest = manifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  const counts = Object.values(manifest.resources).reduce<Record<string, number>>(
    (result, resource) => {
      result[resource.state] = (result[resource.state] ?? 0) + 1;
      return result;
    },
    {},
  );
  return {
    bookId: id,
    ...(manifest.title ? { title: manifest.title } : {}),
    updatedAt: manifest.updatedAt,
    counts,
  };
}

async function runDownload(reference: string | number, options: Partial<DownloadCliOptions>): Promise<void> {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort(new Error('用户取消')));
  const labels = new Map<string, string>();
  let writeImportantLog: ((line: string) => void) | undefined;
  const client = await createClient(options, {
    onRetry: (event) => {
      if (options.verboseProgress) writeImportantLog?.(formatHttpRetry(event, labels.get(event.url)));
    },
  });
  const context: { result?: DownloadResult } = {};
  try {
    await new Listr(
      [
        {
          title: '下载并生成 EPUB',
          rendererOptions: { outputBar: 6 },
          task: async (ctx, task) => {
            const importantLines: string[] = [];
            let currentProgress = '';
            const render = () => {
              task.output = [...importantLines.slice(-4), currentProgress].filter(Boolean).join('\n');
            };
            writeImportantLog = (line) => {
              importantLines.push(line);
              render();
            };
            ctx.result = await new Downloader(client).download(parseBookReference(String(reference)), {
              outputDirectory: options.output ?? DEFAULT_OUTPUT_DIRECTORY,
              workDirectory: options.workDir ?? DEFAULT_WORK_DIRECTORY,
              chapterConcurrency: options.concurrency ?? 3,
              chapterRetryRounds: options.chapterRetryRounds ?? 2,
              chapterRetryDelayMs: options.chapterRetryDelay ?? 15_000,
              ...(options.allowMissingImages !== undefined
                ? { allowMissingImages: options.allowMissingImages }
                : {}),
              signal: controller.signal,
              onProgress: (event) => {
                if (event.sourceUrl) labels.set(event.sourceUrl, event.message);
                const line = formatProgress(event);
                if (options.verboseProgress || event.kind === 'failed' || event.kind === 'retry') {
                  currentProgress = '';
                  writeImportantLog?.(line);
                } else {
                  currentProgress = line;
                  render();
                }
              },
            });
            currentProgress = `输出 ${ctx.result.epubPath}`;
            render();
          },
        },
      ],
      {
        ctx: context,
        rendererOptions: {
          collapseSubtasks: false,
          formatOutput: 'truncate',
        },
      },
    ).run();
    if (context.result) printDownloadSummary(context.result);
  } finally {
    writeImportantLog = undefined;
    if (options.httpStats) printHttpStats(client);
  }
}

type DownloadResult = {
  book: Book;
  epubPath: string;
  workspaceDirectory: string;
};

function isBackInput(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'q';
}

function parseToplistSort(value: string): ToplistSort {
  const normalized = value.trim().toLowerCase();
  const toplist = TOPLISTS.find(
    (candidate) => candidate.value === normalized || candidate.aliases.includes(normalized),
  );
  if (!toplist) {
    throw new Error(`未知榜单：${value}。可用：day/month/all/good/new`);
  }
  return toplist.value;
}

function isToplistSort(value: string): value is ToplistSort {
  return TOPLISTS.some((toplist) => toplist.value === value);
}

function parseSugoiYear(value: string): SugoiYear {
  const year = Number(value);
  if (!Number.isInteger(year) || !SUGOI_YEARS.includes(year as SugoiYear)) {
    throw new Error(`年份必须在 2026 到 2005 之间：${value}`);
  }
  return year as SugoiYear;
}

function missingCookieMessage(): string {
  return [
    '缺少 wenku8 登录 Cookie。',
    '请先在浏览器登录 https://www.wenku8.net/ ，复制 www.wenku8.net 域名下的完整 Cookie，',
    '然后运行 `wenku8 login` 保存；也可以临时使用 `--cookie`、`--cookie-file` 或 WENKU8_COOKIE。',
  ].join('');
}

function parsePositiveInteger(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`必须是正整数：${value}`);
  return number;
}

function parseNonNegativeInteger(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`必须是非负整数：${value}`);
  return number;
}
