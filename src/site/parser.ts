import * as cheerio from 'cheerio';
import { isTag, isText, type AnyNode } from 'domhandler';
import { ParseError } from '../domain/errors.js';
import { stableId } from '../domain/ids.js';
import type { Book, BookSummary, Chapter, ContentBlock, Volume } from '../domain/book.js';

const BASE_URL = 'https://www.wenku8.net';
const DETAIL_LABELS = [
  '文库分类',
  '小说分类',
  '小说作者',
  '作者',
  '文章状态',
  '小说状态',
  '最后更新',
  '更新时间',
  '全文长度',
  '全文字数',
  '作品Tags',
  '作品热度',
  '最近章节',
  '内容简介',
];

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
  const description = extractBookDescription($, content);
  const tags = extractFollowingText($, content, '作品Tags');
  const hotness = extractFollowingText($, content, '作品热度');
  const latestChapter = extractFollowingText($, content, '最近章节');

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
      ...(tags ? { tags } : {}),
      ...(hotness ? { hotness } : {}),
      ...(latestChapter ? { latestChapter } : {}),
    },
  };
}

function extractBookDescription($: cheerio.CheerioAPI, content: cheerio.Cheerio<AnyNode>): string {
  const labeled = findHottextLabel($, content, '内容简介');
  const nextSpan = labeled.nextAll('span').first();
  const description = textWithBreaks(nextSpan);
  if (description) return description;
  return clean(content.find('#contentmain').text() || '');
}

function textWithBreaks(selection: cheerio.Cheerio<AnyNode>): string {
  const clone = selection.clone();
  clone.find('br').replaceWith('\n');
  return clean(clone.text());
}

function extractFollowingText(
  $: cheerio.CheerioAPI,
  content: cheerio.Cheerio<AnyNode>,
  name: string,
): string {
  const labeled = findHottextLabel($, content, name);
  if (labeled.length > 0) {
    const sameText = clean(labeled.text()).replace(new RegExp(`^${name}\\s*[：:]\\s*`), '');
    if (sameText) return sameText;
    const nextSpan = clean(labeled.nextAll('span').first().text());
    if (nextSpan) return nextSpan;
    const nextAnchor = clean(labeled.nextAll('a').first().text());
    if (nextAnchor) return nextAnchor;
  }
  return label(content.text(), [name]);
}

function findHottextLabel(
  $: cheerio.CheerioAPI,
  content: cheerio.Cheerio<AnyNode>,
  name: string,
): cheerio.Cheerio<AnyNode> {
  return content
    .find('span')
    .filter((_index, element) => clean($(element).text()).startsWith(name))
    .first();
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
  const cards = $('div[style]')
    .filter((_index, element) => isSearchResultCard($(element).attr('style') ?? ''))
    .toArray();

  for (const card of cards) {
    const summary = parseSearchResultCard($, $(card));
    if (summary) results.set(summary.id, summary);
  }

  if (results.size === 0) {
    $('a[href*="/book/"][href$=".htm"][tiptitle], a[href*="/book/"][href$=".htm"][title]').each(
      (_index, anchor) => {
        const summary = parseSearchResultCard($, $(anchor).parent());
        if (summary) results.set(summary.id, summary);
      },
    );
  }

  if (results.size === 0) {
    $('a[href*="/book/"][href$=".htm"]').each((_index, anchor) => {
      const summary = parseSearchResultAnchor($, $(anchor));
      if (summary) results.set(summary.id, summary);
    });
  }

  return [...results.values()];
}

export function parseSugoiResults(html: string): BookSummary[] {
  const $ = cheerio.load(html, { xml: false });
  const results: BookSummary[] = [];

  $('table.grid').each((_tableIndex, table) => {
    const section = clean($(table).find('caption').first().text()).replace(/^这本轻小说真厉害！\d+\s*/, '');
    let rank = 0;
    $(table)
      .find('div[style*="WIDTH: 19%"], div[style*="width: 19%"]')
      .each((_index, entry) => {
        rank += 1;
        const root = $(entry);
        const anchor = root.find('a[href*="/book/"][href$=".htm"]').first();
        const href = anchor.attr('href') ?? '';
        const match = /\/book\/(\d+)\.htm$/i.exec(href);
        if (!match?.[1]) return;
        const title = clean(
          anchor.attr('title') ??
            root
              .find('br')
              .first()
              .nextAll('a[href*="/book/"][href$=".htm"]')
              .first()
              .text() ??
            anchor.text(),
        );
        if (!title) return;
        const summary: BookSummary = {
          id: Number(match[1]),
          title,
        };
        if (section) summary.category = section;
        summary.status = `第 ${rank} 名`;
        results.push(summary);
      });
  });

  return results;
}

function parseSearchResultCard(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
): BookSummary | undefined {
  const anchor = preferredBookAnchor($, root);
  if (!anchor) return undefined;
  const href = anchor.attr('href') ?? '';
  const match = /\/book\/(\d+)\.htm$/i.exec(href);
  const title = searchResultTitle(anchor);
  if (!match?.[1] || !title) return undefined;

  const paragraphs = root
    .find('p')
    .toArray()
    .map((paragraph) => clean($(paragraph).text()));
  const authorCategory = paragraphs.find((text) => /作者\s*:/.test(text));
  const updateInfo = paragraphs.find((text) => /更新\s*:/.test(text) || /字数\s*:/.test(text));
  const tags = clean(root.find('p span[style*="font-weight:bold"]').first().text())
    .split(/\s+/)
    .filter(Boolean);
  const description = paragraphs
    .find((text) => text.startsWith('简介:') || text.startsWith('简介：'))
    ?.replace(/^简介[：:]\s*/, '');
  const notice = paragraphs
    .find((text) => text.startsWith('公告:') || text.startsWith('公告：'))
    ?.replace(/^公告[：:]\s*/, '');
  const status =
    paragraphs.find((text) => /已完结|连载中|已动画化/.test(text) && !/更新\s*:/.test(text)) ??
    updateInfo
      ?.split('/')
      .map((part) => clean(part))
      .find((part) => /已完结|连载中/.test(part));

  const summary: BookSummary = {
    id: Number(match[1]),
    title,
  };
  const author = searchField(authorCategory, '作者');
  const category = searchField(authorCategory, '分类');
  const updatedAt = searchField(updateInfo, '更新');
  const length = searchField(updateInfo, '字数');
  if (author) summary.author = author;
  if (category) summary.category = category;
  if (updatedAt) summary.updatedAt = updatedAt;
  if (length) summary.length = length;
  if (status) summary.status = status;
  if (tags.length > 0) summary.tags = tags;
  if (description) summary.description = description;
  if (notice) summary.notice = notice;
  return summary;
}

function parseSearchResultAnchor(
  $: cheerio.CheerioAPI,
  anchor: cheerio.Cheerio<AnyNode>,
): BookSummary | undefined {
  return parseSearchResultCard($, anchor.parent());
}

function preferredBookAnchor(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<AnyNode>,
): cheerio.Cheerio<AnyNode> | undefined {
  const anchors = root.find('a[href*="/book/"][href$=".htm"]').toArray().map((anchor) => $(anchor));
  const candidates = [
    anchors.find((anchor) => Boolean(anchor.attr('tiptitle'))),
    anchors.find((anchor) => anchor.parent().is('b') && !isActionLink(anchor.text())),
    anchors.find((anchor) => Boolean(anchor.attr('title'))),
    anchors.find((anchor) => !isActionLink(anchor.text())),
  ];
  return candidates.find((anchor) => anchor && anchor.length > 0);
}

function searchResultTitle(anchor: cheerio.Cheerio<AnyNode>): string {
  const title = clean(anchor.attr('tiptitle') ?? anchor.attr('title') ?? anchor.text());
  return isActionLink(title) ? '' : title;
}

function isSearchResultCard(style: string): boolean {
  return /width\s*:\s*373px/i.test(style) && /height\s*:\s*136px/i.test(style);
}

function isActionLink(value: string): boolean {
  return /^(?:我要阅读|加入书架|推荐本书)$/.test(clean(value));
}

function searchField(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  for (const segment of value.split('/')) {
    const match = new RegExp(`${field}\\s*[:：]\\s*(.+)`).exec(segment);
    if (match?.[1]) return clean(match[1]);
  }
  return undefined;
}

function label(text: string, names: string[]): string {
  for (const name of names) {
    const otherLabels = DETAIL_LABELS.filter((labelName) => labelName !== name)
      .map(escapeRegExp)
      .join('|');
    const match = new RegExp(
      `${escapeRegExp(name)}\\s*[：:]\\s*([\\s\\S]*?)(?=\\s*(?:${otherLabels})\\s*[：:]|$)`,
    ).exec(text);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
