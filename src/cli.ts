#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import { Command } from 'commander';
import { Downloader } from './service/downloader.js';
import { Wenku8Client } from './site/client.js';
import { parseBookReference } from './domain/ids.js';
import { printProgress } from './cli/progress.js';
import { commandAvailable, runEpubCheck } from './cli/epubcheck.js';
import { manifestSchema } from './storage/schema.js';
import { resolveCookie } from './cli/cookie.js';

const VERSION = '4.0.0';
const program = new Command();

program.name('wenku8').description('可恢复、图片完整性优先的轻小说 EPUB 下载器').version(VERSION);

program
  .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
  .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie');

program
  .command('search')
  .description('按小说名或作者搜索')
  .argument('<keyword>', '搜索关键词')
  .option('--author', '按作者搜索')
  .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
  .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
  .action(async (keyword: string, options: SearchCliOptions) => {
    const results = await (
      await createClient(options)
    ).search(keyword, options.author ? 'author' : 'articlename');
    if (results.length === 0) console.log('没有找到结果');
    for (const result of results) console.log(`${result.id}\t${result.title}`);
  });

program
  .command('info')
  .description('显示小说元数据')
  .argument('<book>', '小说 ID 或详情页 URL')
  .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
  .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
  .action(async (reference: string, options: CredentialCliOptions) => {
    const { book } = await (await createClient(options)).getBookDetails(parseBookReference(reference));
    console.log(JSON.stringify(book, null, 2));
  });

const addDownloadCommand = (name: 'download' | 'resume') =>
  program
    .command(name)
    .description(name === 'download' ? '下载小说并生成 EPUB' : '继续未完成的下载')
    .argument('<book>', '小说 ID 或详情页 URL')
    .option('-o, --output <directory>', 'EPUB 输出目录', 'downloads')
    .option('-w, --work-dir <directory>', '工作区目录', 'downloads')
    .option('-c, --concurrency <number>', '网络并发数', parsePositiveInteger, 3)
    .option('-r, --rate-limit <number>', '每秒最多请求数', parsePositiveInteger, 1)
    .option('--chapter-retry-rounds <number>', '章节失败后的整轮自动重试次数', parseNonNegativeInteger, 2)
    .option('--chapter-retry-delay <ms>', '章节自动重试轮次之间的等待毫秒数', parseNonNegativeInteger, 15_000)
    .option('--cookie <value>', '可选的站点 Cookie，也可使用 WENKU8_COOKIE')
    .option('--cookie-file <file>', '本地 Cookie 文件，默认读取 .wenku8-cookie')
    .option('--allow-missing-images', '允许生成缺图 EPUB')
    .option('--http-stats', '打印 HTTP 传输统计')
    .action(async (reference: string, options: DownloadCliOptions) => {
      const controller = new AbortController();
      process.once('SIGINT', () => controller.abort(new Error('用户取消')));
      const client = await createClient(options);
      try {
        const result = await new Downloader(client).download(parseBookReference(reference), {
          outputDirectory: options.output,
          workDirectory: options.workDir,
          chapterConcurrency: options.concurrency,
          chapterRetryRounds: options.chapterRetryRounds,
          chapterRetryDelayMs: options.chapterRetryDelay,
          ...(options.allowMissingImages !== undefined
            ? { allowMissingImages: options.allowMissingImages }
            : {}),
          signal: controller.signal,
          onProgress: printProgress,
        });
        console.log(`完成：${result.epubPath}`);
      } finally {
        if (options.httpStats) printHttpStats(client);
      }
    });

addDownloadCommand('download');
addDownloadCommand('resume');

program
  .command('status')
  .description('查看下载工作区状态')
  .argument('<book>', '小说 ID')
  .option('-w, --work-dir <directory>', '工作区目录', 'downloads')
  .action(async (reference: string, options: { workDir: string }) => {
    const id = parseBookReference(reference);
    const file = path.resolve(options.workDir, String(id), 'manifest.json');
    const manifest = manifestSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    const counts = Object.values(manifest.resources).reduce<Record<string, number>>(
      (result, resource) => {
        result[resource.state] = (result[resource.state] ?? 0) + 1;
        return result;
      },
      {},
    );
    console.log(
      JSON.stringify(
        { bookId: id, title: manifest.title, updatedAt: manifest.updatedAt, counts },
        null,
        2,
      ),
    );
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
    console.log(`Node.js: ${process.version}`);
    console.log(`Java: ${java ? '可用' : '未安装'}`);
    console.log(`EPUBCheck: ${epubcheck ? '可用' : '未安装（仅影响官方规范校验命令）'}`);
  });

program.action(async () => interactive());

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function interactive(): Promise<void> {
  const action = await select({
    message: '请选择操作',
    choices: [
      { name: '下载小说', value: 'download' },
      { name: '搜索小说', value: 'search' },
      { name: '退出', value: 'exit' },
    ],
  });
  if (action === 'exit') return;
  if (action === 'search') {
    const keyword = await input({ message: '小说名或作者' });
    const results = await (await createClient()).search(keyword);
    for (const result of results) console.log(`${result.id}\t${result.title}`);
    return;
  }
  const reference = await input({ message: '小说 ID 或详情页 URL' });
  const result = await new Downloader(await createClient()).download(parseBookReference(reference), {
    onProgress: printProgress,
  });
  console.log(`完成：${result.epubPath}`);
}

interface CredentialCliOptions {
  cookie?: string;
  cookieFile?: string;
}

interface SearchCliOptions extends CredentialCliOptions {
  author?: boolean;
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
}

async function createClient(options: Partial<DownloadCliOptions> = {}): Promise<Wenku8Client> {
  const globalOptions = program.opts<CredentialCliOptions>();
  const cookieOptions: CredentialCliOptions = {};
  const cookie = options.cookie ?? globalOptions.cookie;
  const cookieFile = options.cookieFile ?? globalOptions.cookieFile;
  if (cookie !== undefined) cookieOptions.cookie = cookie;
  if (cookieFile !== undefined) cookieOptions.cookieFile = cookieFile;
  const resolvedCookie = await resolveCookie(cookieOptions);
  return new Wenku8Client({
    concurrency: options.concurrency ?? 3,
    requestsPerSecond: options.rateLimit ?? 1,
    preferCurl: Boolean(resolvedCookie),
    ...(resolvedCookie ? { cookie: resolvedCookie } : {}),
  });
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

function printHttpStats(client: Wenku8Client): void {
  const stats = client.http.stats();
  console.log(
    JSON.stringify(
      {
        httpStats: {
          transport: {
            nodeFetchRequests: stats.fetchRequests,
            curlRequests: stats.curlRequests,
            curlFallbacks: stats.curlFallbacks,
          },
          limitsAndRetries: {
            cloudflareChallenges: stats.cloudflareChallenges,
            http429Responses: stats.http429Responses,
            retryableFailures: stats.retryableFailures,
            automaticRetries: stats.automaticRetries,
            rateLimitCooldowns: stats.rateLimitCooldowns,
            rateLimitCooldownWaitMs: Math.round(stats.rateLimitCooldownWaitMs),
          },
          statusCodes: stats.statusCodes,
        },
      },
      null,
      2,
    ),
  );
}
