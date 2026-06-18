import color from 'yoctocolors';
import boxen from 'boxen';
import type { Book, BookSummary } from '../domain/book.js';
import type { HttpRetryEvent } from '../http/client.js';
import type { ProgressEvent } from '../service/downloader.js';
import type { Wenku8Client } from '../site/client.js';

const PHASE_LABELS: Record<ProgressEvent['phase'], string> = {
  metadata: '准备',
  chapters: '章节',
  images: '图片',
  epub: 'EPUB',
};
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export function formatProgress(event: ProgressEvent): string {
  const label = color.cyan(PHASE_LABELS[event.phase]);
  const marker = eventMarker(event);
  const message = event.error
    ? `${event.message} ${color.red(truncateMiddle(event.error, 52))}`
    : event.message;
  if (!event.total) return `${label} ${marker} ${message}`;
  const completed = event.completed ?? 0;
  const total = event.total;
  const percentage = total === 0 ? 0 : completed / total;
  return `${label} ${marker} ${bar(percentage)} ${color.bold(`${completed}/${total}`)} ${color.dim(
    truncateMiddle(message, 58),
  )}`;
}

export function formatHttpRetry(event: HttpRetryEvent, label?: string): string {
  const reason = event.status ? `HTTP ${event.status}` : truncateMiddle(event.error.message, 42);
  const target = label ?? truncateMiddle(event.url, 72);
  return `${color.yellow('重试')} ${reason} 第 ${event.attemptNumber} 次失败，剩余 ${
    event.retriesLeft
  } 次：${color.dim(target)}`;
}

export function printSearchResults(results: BookSummary[]): void {
  if (results.length === 0) {
    console.log(color.yellow('没有找到结果'));
    return;
  }
  console.log(results.map((result, index) => renderSearchResult(result, index)).join('\n\n'));
}

export function printBookInfo(book: Omit<Book, 'volumes' | 'assets'>): void {
  const rows: Array<[string, string]> = [
    ['ID', String(book.id)],
    ['作者', book.author],
    ['分类', book.metadata.category ?? '未知'],
    ['状态', book.metadata.status ?? '未知'],
    ['更新时间', book.metadata.updatedAt || '未知'],
    ['字数', book.metadata.length || '未知'],
  ];
  if (book.metadata.tags) rows.push(['Tags', book.metadata.tags]);
  if (book.metadata.hotness) rows.push(['热度', book.metadata.hotness]);
  if (book.metadata.latestChapter) rows.push(['最近章节', book.metadata.latestChapter]);
  rows.push(['目录', book.catalogueUrl]);

  const body = [kv(rows), renderDescription(book.description)].filter(Boolean).join('\n\n');
  console.log(panel(book.title, body));
}

export function printDownloadSummary(result: { book: Book; epubPath: string; workspaceDirectory: string }): void {
  const chapters = result.book.volumes.reduce((total, volume) => total + volume.chapters.length, 0);
  const images = result.book.assets.filter((asset) => asset.role === 'illustration').length;
  console.log(panel('下载完成', kv([
    ['书名', result.book.title],
    ['卷数', String(result.book.volumes.length)],
    ['章节', String(chapters)],
    ['插图', String(images)],
    ['输出', result.epubPath],
    ['工作区', result.workspaceDirectory],
  ])));
}

export function printStatus(data: {
  bookId: number;
  title?: string;
  updatedAt: string;
  counts: Record<string, number>;
}): void {
  console.log(panel(data.title ? `工作区：${data.title}` : `工作区：${data.bookId}`, kv([
    ['书籍 ID', String(data.bookId)],
    ['更新时间', data.updatedAt],
    ['complete', String(data.counts.complete ?? 0)],
    ['running', String(data.counts.running ?? 0)],
    ['failed', String(data.counts.failed ?? 0)],
  ])));
}

export function printDoctorStatus(status: {
  node: string;
  java: boolean;
  epubcheck: boolean;
}): void {
  console.log(panel('环境检查', kv([
    ['Node.js', status.node],
    ['Java', status.java ? color.green('可用') : color.yellow('未安装')],
    ['EPUBCheck', status.epubcheck ? color.green('可用') : color.yellow('未安装')],
  ])));
}

export function printHttpStats(client: Wenku8Client): void {
  const stats = client.http.stats();
  console.log(panel('HTTP 统计', kv([
    ['Node fetch', String(stats.fetchRequests)],
    ['curl', String(stats.curlRequests)],
    ['curl fallback', String(stats.curlFallbacks)],
    ['Cloudflare challenge', String(stats.cloudflareChallenges)],
    ['HTTP 429', String(stats.http429Responses)],
    ['自动重试', String(stats.automaticRetries)],
    ['限流冷却', `${stats.rateLimitCooldowns} 次 / ${Math.round(stats.rateLimitCooldownWaitMs)}ms`],
    ['状态码', JSON.stringify(stats.statusCodes)],
  ])));
}

export function title(value: string): string {
  return `${color.bold(color.cyan(value))}`;
}

function kv(rows: Array<[string, string]>): string {
  const width = Math.max(...rows.map(([key]) => visibleLength(key)));
  return rows.map(([key, value]) => `${color.dim(key.padEnd(width))}  ${value}`).join('\n');
}

function resultStatus(result: BookSummary): string {
  return [result.status, result.updatedAt, result.length].filter(Boolean).join(' / ');
}

function renderDescription(description: string): string {
  if (!description) return '';
  return `${color.dim('简介')}\n${wrapText(description, 82)
    .map((line) => `  ${line}`)
    .join('\n')}`;
}

function renderSearchResult(result: BookSummary, index: number): string {
  const heading = `${color.dim(`${String(index + 1).padStart(2, '0')}.`)} ${color.bold(
    result.title,
  )} ${color.dim(`#${result.id}`)}`;
  const meta = [
    result.author ? ['作者', result.author] : undefined,
    result.category ? ['分类', result.category] : undefined,
    resultStatus(result) ? ['状态', resultStatus(result)] : undefined,
  ]
    .filter((entry): entry is [string, string] => Boolean(entry))
    .map(([key, value]) => `${color.dim(key)} ${value}`)
    .join(color.dim('  /  '));
  const tags =
    result.tags && result.tags.length > 0
      ? `${color.dim('标签')} ${result.tags.map((tag) => color.cyan(tag)).join(color.dim('  '))}`
      : '';
  const description = result.notice
    ? `${color.yellow('公告')} ${truncateMiddle(result.notice, 76)}`
    : result.description
      ? `${color.dim('简介')} ${truncateMiddle(result.description, 76)}`
      : '';
  return [heading, indent(meta), indent(tags), indent(description)].filter(Boolean).join('\n');
}

function indent(value: string): string {
  return value ? `    ${value}` : '';
}

function bar(value: number): string {
  const width = 18;
  const filled = Math.round(width * Math.max(0, Math.min(1, value)));
  return `${color.green('='.repeat(filled))}${color.dim('-'.repeat(width - filled))}`;
}

function eventMarker(event: ProgressEvent): string {
  switch (event.kind) {
    case 'start':
      return color.dim('开始');
    case 'complete':
      return color.green('完成');
    case 'failed':
      return color.red('失败');
    case 'retry':
      return color.yellow('重试');
    case 'info':
    case undefined:
      return color.dim('进行');
    default:
      return color.dim('进行');
  }
}

function truncateMiddle(value: string, maxLength: number): string {
  if (visibleLength(value) <= maxLength) return value;
  const head = Math.floor((maxLength - 3) / 2);
  const tail = maxLength - 3 - head;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function wrapText(value: string, width: number): string[] {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    if (visibleLength(current) >= width) {
      lines.push(current);
      current = '';
    }
    current += char;
  }
  if (current) lines.push(current);
  return lines;
}

function visibleLength(value: string): number {
  return value.replace(ANSI_PATTERN, '').length;
}

function panel(heading: string, body: string): string {
  return boxen(body, {
    title: color.bold(color.cyan(heading)),
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 0 },
    borderColor: 'cyan',
    borderStyle: 'round',
  });
}
