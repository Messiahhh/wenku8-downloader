import { describe, expect, it } from 'vitest';
import {
  parseBookDetails,
  parseCatalogue,
  parseChapter,
  parsePackedChapter,
  parseSearchResults,
} from './parser.js';
import { packedChapterIds } from './client.js';

describe('Wenku8 parser', () => {
  it('parses details without depending on child indexes', () => {
    const html = `
      <div id="content">
        <div><span><b>测试小说</b></span></div>
        <div>小说作者：测试作者\n文章状态：连载中\n全文长度：123456字</div>
        <img src="//img.example/cover.webp" />
        <a href="/novel/42/index.htm">小说目录</a>
        <div id="contentmain">这是一本测试小说。</div>
      </div>`;
    const book = parseBookDetails(html, 42, 'https://www.wenku8.net/book/42.htm');
    expect(book).toMatchObject({
      id: 42,
      title: '测试小说',
      author: '测试作者',
      catalogueUrl: 'https://www.wenku8.net/novel/42/index.htm',
      coverSourceUrl: 'https://img.example/cover.webp',
    });
  });

  it('parses volumes and chapters including a volume-less catalogue', () => {
    const html = `<table><tbody>
      <tr><td colspan="4">第一卷</td></tr>
      <tr><td><a href="1001.htm">第一章</a></td><td><a href="1002.htm">第二章</a></td></tr>
      <tr><td colspan="4">第二卷</td></tr>
      <tr><td><a href="1003.htm">第三章</a></td></tr>
    </tbody></table>`;
    const volumes = parseCatalogue(html, 'https://www.wenku8.net/novel/42/index.htm');
    expect(volumes.map((volume) => [volume.title, volume.chapters.length])).toEqual([
      ['第一卷', 2],
      ['第二卷', 1],
    ]);
    expect(volumes[0]?.chapters[0]?.sourceUrl).toBe('https://www.wenku8.net/novel/42/1001.htm');
  });

  it('preserves image order and detects unresolved placeholders', () => {
    const chapter = parseChapter(
      `<div id="content"><p>第一段</p><img data-src="/pictures/42/1.jpg" alt="插图一"><p>第二段【图片】结尾</p></div>`,
      {
        id: 'c1',
        index: 0,
        title: '第一章',
        sourceUrl: 'https://www.wenku8.net/novel/42/1.htm',
        blocks: [],
      },
    );
    expect(chapter.blocks.map((block) => block.type)).toEqual([
      'paragraph',
      'image',
      'paragraph',
      'image',
      'paragraph',
    ]);
    expect(chapter.blocks[1]).toMatchObject({
      type: 'image',
      sourceUrl: 'https://www.wenku8.net/pictures/42/1.jpg',
    });
    expect(chapter.blocks[3]).toMatchObject({ type: 'image', sourceUrl: null });
  });

  it('deduplicates search results by book id', () => {
    const results = parseSearchResults(`
      <a href="https://www.wenku8.net/book/42.htm" title="测试小说">详情</a>
      <a href="https://www.wenku8.net/book/42.htm">测试小说</a>`);
    expect(results).toEqual([{ id: 42, title: '测试小说' }]);
  });

  it('restores images from a packed chapter', () => {
    const chapter = parsePackedChapter(
      '第一段\n\nhttp://pic.wenku8.com/pictures/42/100/1.jpg(123K)\n\n第二段',
      {
        id: 'c1',
        index: 0,
        title: '下架章节',
        sourceUrl: 'https://www.wenku8.net/novel/42/100.htm',
        blocks: [],
      },
    );
    expect(chapter.blocks).toEqual([
      { type: 'paragraph', text: '第一段' },
      {
        type: 'image',
        sourceUrl: 'http://pic.wenku8.com/pictures/42/100/1.jpg',
        alt: '插图',
      },
      { type: 'paragraph', text: '第二段' },
    ]);
  });

  it('restores images from packed HTML divimage entries', () => {
    const chapter = parsePackedChapter(
      `<div class="chaptercontent">
        <div class="chaptertitle">插图</div>
        <div class="divimage" title="https://pic.777743.xyz/1/1861/65640/79833.jpg">
          <a>https://pic.777743.xyz/1/1861/65640/79833.jpg</a>(107K)
        </div>
        <p>正文段落</p>
      </div>`,
      {
        id: 'c1',
        index: 0,
        title: '插图',
        sourceUrl: 'https://www.wenku8.net/novel/1/1861/65640.htm',
        blocks: [],
      },
    );
    expect(chapter.blocks).toContainEqual({
      type: 'image',
      sourceUrl: 'https://pic.777743.xyz/1/1861/65640/79833.jpg',
      alt: '插图',
    });
    expect(chapter.blocks).toContainEqual({ type: 'paragraph', text: '正文段落' });
  });

  it('restores direct text from packed HTML chaptercontent', () => {
    const chapter = parsePackedChapter(
      `<div class="chaptercontent">
        第一段<br><br>
        第二段
      </div>`,
      {
        id: 'c1',
        index: 0,
        title: '版权页',
        sourceUrl: 'https://www.wenku8.net/novel/1/1861/65281.htm',
        blocks: [],
      },
    );
    expect(chapter.blocks).toEqual([{ type: 'paragraph', text: '第一段 第二段' }]);
  });

  it('splits adjacent packed image URLs with size suffixes', () => {
    const chapter = parsePackedChapter(
      `<div class="chaptercontent">
        https://pic.777743.xyz/1/1861/65640/79833.jpg(107K)https://pic.777743.xyz/1/1861/65640/79834.jpg(90K)
      </div>`,
      {
        id: 'c1',
        index: 0,
        title: '插图',
        sourceUrl: 'https://www.wenku8.net/novel/1/1861/65640.htm',
        blocks: [],
      },
    );
    expect(chapter.blocks).toEqual([
      {
        type: 'image',
        sourceUrl: 'https://pic.777743.xyz/1/1861/65640/79833.jpg',
        alt: '插图',
      },
      {
        type: 'image',
        sourceUrl: 'https://pic.777743.xyz/1/1861/65640/79834.jpg',
        alt: '插图',
      },
    ]);
  });

  it('derives packed chapter ids from legacy and current chapter URLs', () => {
    expect(packedChapterIds('https://www.wenku8.net/novel/1861/65281.htm')).toEqual({
      bookId: '1861',
      chapterId: '65281',
    });
    expect(packedChapterIds('https://www.wenku8.net/novel/1/1861/65281.htm')).toEqual({
      bookId: '1861',
      chapterId: '65281',
    });
  });
});
