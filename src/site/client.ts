import iconv from 'iconv-lite';
import type { BookSummary, Chapter, Volume } from '../domain/book.js';
import type { BookDetails } from './parser.js';
import {
  parseBookDetails,
  parseCatalogue,
  parseChapter,
  parsePackedChapter,
  parseSearchResults,
} from './parser.js';
import { HttpClient, type HttpClientOptions } from '../http/client.js';
import { CopyrightUnavailableError } from '../domain/errors.js';

const BASE_URL = 'https://www.wenku8.net';

export class Wenku8Client {
  readonly http: HttpClient;

  constructor(options: HttpClientOptions = {}) {
    this.http = new HttpClient(options);
  }

  async getBookDetails(
    bookId: number,
    signal?: AbortSignal,
  ): Promise<{ book: BookDetails; raw: string }> {
    const sourceUrl = `${BASE_URL}/book/${bookId}.htm`;
    const raw = await this.http.text(sourceUrl, 'gb18030', signal);
    return { book: parseBookDetails(raw, bookId, sourceUrl), raw };
  }

  async getCatalogue(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ volumes: Volume[]; raw: string }> {
    const raw = await this.http.text(url, 'gb18030', signal);
    return { volumes: parseCatalogue(raw, url), raw };
  }

  async getChapter(
    chapter: Chapter,
    signal?: AbortSignal,
  ): Promise<{ chapter: Chapter; raw: string }> {
    const raw = await this.http.text(chapter.sourceUrl, 'gb18030', signal);
    if (isCopyrightUnavailable(raw)) {
      throw new CopyrightUnavailableError(chapter.title, chapter.sourceUrl);
    }
    if (isPackedFallbackChapter(raw)) {
      return { chapter: await this.getPackedChapter(chapter, signal), raw };
    }
    return { chapter: parseChapter(raw, chapter), raw };
  }

  async search(
    keyword: string,
    type: 'articlename' | 'author' = 'articlename',
  ): Promise<BookSummary[]> {
    const encoded = [...iconv.encode(keyword, 'gbk')]
      .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
      .join('');
    const url = `${BASE_URL}/modules/article/search.php?searchtype=${type}&searchkey=${encoded}`;
    return parseSearchResults(await this.http.text(url));
  }

  private async getPackedChapter(chapter: Chapter, signal?: AbortSignal): Promise<Chapter> {
    const ids = packedChapterIds(chapter.sourceUrl);
    if (!ids) throw new Error(`无法从章节地址推导下载包：${chapter.sourceUrl}`);
    const query = `aid=${ids.bookId}&vid=${ids.chapterId}`;
    const candidates: Array<[string, string]> = [
      [`https://dl.wenku8.com/pack.php?${query}`, 'utf-8'],
      [`https://dl.wenku8.com/packtxt.php?${query}`, 'utf-16le'],
      [`http://dl.wenku8.com/pack.php?${query}`, 'utf-8'],
      [`http://dl.wenku8.com/packtxt.php?${query}`, 'utf-16le'],
    ];
    let lastError: unknown;
    for (const [url, encoding] of candidates) {
      try {
        return parsePackedChapter(await this.http.text(url, encoding, signal), chapter);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`《${chapter.title}》正文已下架，且下载包获取失败`, { cause: lastError });
  }
}

export function isCopyrightUnavailable(html: string): boolean {
  return /因版权问题[^<]*不再提供/.test(html);
}

function isPackedFallbackChapter(html: string): boolean {
  return /<span[^>]*>\s*null\s*<\/span>/i.test(html);
}

export function packedChapterIds(url: string): { bookId: string; chapterId: string } | undefined {
  const match = /\/novel\/(?:\d+\/)?(\d+)\/(\d+)\.htm/i.exec(url);
  if (!match?.[1] || !match[2]) return undefined;
  return { bookId: match[1], chapterId: match[2] };
}
