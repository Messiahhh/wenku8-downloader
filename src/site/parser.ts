import * as cheerio from 'cheerio';
import { isTag, isText, type AnyNode } from 'domhandler';
import { ParseError } from '../domain/errors.js';
import { stableId } from '../domain/ids.js';
import type { Book, BookSummary, Chapter, ContentBlock, Volume } from '../domain/book.js';

const BASE_URL = 'https://www.wenku8.net';

export type BookDetails = Omit<Book, 'volumes' | 'assets'>;

export function parseBookDetails(html: string, bookId: number, sourceUrl: string): BookDetails {
  const $ = cheerio.load(html, { xml: false });
  const content = $('#content');
  const title = clean(
    content.find('span b').first().text() ||
      content.find('h1').first().text() ||
      $('title').text().split('-')[0] ||
      '',
  );
  if (!title) throw new ParseError(`无法解析小说 ${bookId} 的标题`);

  const pageText = content.text();
  const author = label(pageText, ['小说作者', '作者']) || '未知作者';
  const catalogueHref = content
    .find('a[href$="/index.htm"], a[href*="/novel/"][href$="index.htm"]')
    .first()
    .attr('href');
  if (!catalogueHref) throw new ParseError(`无法解析《${title}》的目录地址`);

  const coverHref =
    content.find('img').first().attr('data-src') ?? content.find('img').first().attr('src');
  const description = clean(
    content.find('#contentmain').text() || content.find('span').last().text() || '',
  );

  return {
    id: bookId,
    title,
    author,
    language: 'zh-CN',
    description,
    sourceUrl,
    catalogueUrl: absoluteUrl(catalogueHref, sourceUrl),
    ...(coverHref ? { coverSourceUrl: absoluteUrl(coverHref, sourceUrl) } : {}),
    metadata: {
      category: label(pageText, ['文库分类', '小说分类']),
      status: label(pageText, ['文章状态', '小说状态']),
      updatedAt: label(pageText, ['最后更新', '更新时间']),
      length: label(pageText, ['全文长度', '全文字数']),
    },
  };
}

export function parseCatalogue(html: string, catalogueUrl: string): Volume[] {
  const $ = cheerio.load(html, { xml: false });
  const volumes: Volume[] = [];
  let current: Volume | undefined;

  $('table tr').each((_rowIndex, row) => {
    const cells = $(row).children('td');
    const heading = cells.filter('[colspan]').first();
    if (heading.length > 0) {
      const title = clean(heading.text()) || `第 ${volumes.length + 1} 卷`;
      current = {
        id: stableId(`${volumes.length}:${title}`),
        index: volumes.length,
        title,
        chapters: [],
      };
      volumes.push(current);
      return;
    }

    $(row)
      .find('a[href]')
      .each((_anchorIndex, anchor) => {
        const href = $(anchor).attr('href');
        const title = clean($(anchor).text());
        if (!href || !title || !/\.htm(?:[?#].*)?$/i.test(href)) return;
        if (!current) {
          current = { id: 'volume-1', index: 0, title: '正文', chapters: [] };
          volumes.push(current);
        }
        const sourceUrl = absoluteUrl(href, catalogueUrl);
        current.chapters.push({
          id: stableId(sourceUrl),
          index: current.chapters.length,
          title,
          sourceUrl,
          blocks: [],
        });
      });
  });

  if (volumes.length === 0 || volumes.every((volume) => volume.chapters.length === 0)) {
    throw new ParseError('目录页中没有找到章节');
  }
  return volumes;
}

export function parseChapter(html: string, chapter: Chapter): Chapter {
  const $ = cheerio.load(html, { xml: false });
  const root = $('#content').first().length > 0 ? $('#content').first() : $('#contentmain').first();
  if (root.length === 0) throw new ParseError(`《${chapter.title}》没有正文节点`);

  const blocks: ContentBlock[] = [];
  let text = '';
  const flush = (type: 'paragraph' | 'heading' | 'note' = 'paragraph', level?: number) => {
    const value = clean(text);
    text = '';
    if (!value) return;
    const pieces = value.split(/(【图片】|\[图片\])/g).filter(Boolean);
    for (const piece of pieces) {
      if (/^(?:【图片】|\[图片\])$/.test(piece)) {
        blocks.push({ type: 'image', sourceUrl: null, alt: '图片' });
      } else if (type === 'heading') {
        blocks.push({ type, text: piece, level: level ?? 2 });
      } else {
        blocks.push({ type, text: piece });
      }
    }
  };

  const visit = (node: AnyNode) => {
    if (isText(node)) {
      text += node.data;
      return;
    }
    if (!isTag(node)) return;
    const element = node;
    const tag = element.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    if (tag === 'img') {
      flush();
      const selection = $(element);
      const href =
        selection.attr('data-src') ?? selection.attr('data-original') ?? selection.attr('src');
      blocks.push({
        type: 'image',
        sourceUrl: href ? absoluteUrl(href, chapter.sourceUrl) : null,
        alt: clean(selection.attr('alt') ?? '') || '插图',
      });
      return;
    }
    if (tag === 'br' || tag === 'hr') {
      flush();
      if (tag === 'hr') blocks.push({ type: 'separator' });
      return;
    }

    const blockTag = /^(?:p|div|section|article|li|h[1-6])$/.test(tag);
    if (blockTag) flush();
    for (const child of element.children) visit(child);
    if (blockTag) flush(tag.startsWith('h') ? 'heading' : 'paragraph', Number(tag.slice(1)) || 2);
  };

  for (const node of root.contents().toArray()) visit(node);
  flush();

  const filtered = blocks.filter((block) => {
    if (block.type === 'image') return !isSiteChromeImage(block.sourceUrl);
    if (block.type === 'separator') return true;
    return !/轻小说文库.*一网打尽|本文来自\s*轻小说文库/.test(block.text);
  });
  if (filtered.length === 0) throw new ParseError(`《${chapter.title}》解析后没有正文`);
  return { ...chapter, blocks: filtered };
}

export function parsePackedChapter(content: string, chapter: Chapter): Chapter {
  const blocks: ContentBlock[] = [];

  if (/<[a-z][\s\S]*>/i.test(content)) {
    const $ = cheerio.load(content, { xml: false });
    const chapterContent = $('.chaptercontent').first();
    const root = chapterContent.length > 0 ? chapterContent : $('body');
    appendPackedTextAndImages(blocks, root.text());
    const knownImages = new Set(
      blocks.filter((block) => block.type === 'image').map((block) => block.sourceUrl),
    );
    root.find('[title], a[href], img[src]').each((_index, element) => {
      const selection = $(element);
      for (const value of [selection.attr('title'), selection.attr('href'), selection.attr('src')]) {
        const imageUrl = imageUrlFromText(value);
        if (imageUrl && !knownImages.has(imageUrl)) {
          knownImages.add(imageUrl);
          blocks.push({ type: 'image', sourceUrl: imageUrl, alt: '插图' });
        }
      }
    });
  } else {
    appendPackedTextAndImages(blocks, content);
  }

  if (blocks.length === 0) throw new ParseError(`《${chapter.title}》的下载包没有可用正文`);
  return { ...chapter, blocks };
}

function appendPackedTextAndImages(blocks: ContentBlock[], content: string): void {
  const imagePattern = /(https?:\/\/[^\s"'<>()]+\.(?:jpg|jpeg|png|gif|webp))(?:\(\d+K\))?/gi;
  for (const piece of content.split(imagePattern)) {
    const value = clean(piece);
    if (!value) continue;
    if (imageUrlFromText(value)) {
      blocks.push({ type: 'image', sourceUrl: value, alt: '插图' });
      continue;
    }
    appendPackedText(blocks, value);
  }
}

function appendPackedText(blocks: ContentBlock[], content: string): void {
  for (const paragraph of content.split(/(?:\r?\n){2,}/)) {
    const text = clean(paragraph);
    if (text && !/轻小说文库.*一网打尽/.test(text)) {
      blocks.push({ type: 'paragraph', text });
    }
  }
}

function imageUrlFromText(value?: string): string | undefined {
  return /(https?:\/\/[^\s"'<>()]+\.(?:jpg|jpeg|png|gif|webp))/i.exec(value ?? '')?.[1];
}

export function parseSearchResults(html: string): BookSummary[] {
  const $ = cheerio.load(html, { xml: false });
  const results = new Map<number, BookSummary>();
  $('a[href*="/book/"][href$=".htm"]').each((_index, anchor) => {
    const href = $(anchor).attr('href') ?? '';
    const match = /\/book\/(\d+)\.htm$/i.exec(href);
    const title = clean($(anchor).attr('title') ?? $(anchor).text());
    if (match?.[1] && title) results.set(Number(match[1]), { id: Number(match[1]), title });
  });
  return [...results.values()];
}

function label(text: string, names: string[]): string {
  for (const name of names) {
    const match = new RegExp(`${name}\\s*[：:]\\s*([^\\n\\r]+)`).exec(text);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function clean(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteUrl(value: string, base: string): string {
  if (value.startsWith('//')) return `https:${value}`;
  return new URL(value, base || BASE_URL).toString();
}

function isSiteChromeImage(url: string | null): boolean {
  if (!url) return false;
  return /(?:logo|banner|avatar|button|icon|counter)[^/]*\.(?:gif|png|jpe?g)$/i.test(url);
}
