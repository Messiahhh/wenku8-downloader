import { describe, expect, it } from 'vitest';
import {
  parseBookDetails,
  parseCatalogue,
  parseChapter,
  parsePackedChapter,
  parseSearchResults,
  parseSugoiResults,
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

  it('parses rich details from the current book detail layout', () => {
    const html = `
      <div id="content">
        <div style="width:99%;margin:auto;">
          <table>
            <tr>
              <td align="center"><span><b>败北女角太多了！(败犬女主太多了！)</b>[<a>推一下!</a>]</span></td>
            </tr>
            <tr>
              <td>文库分类：小学馆</td>
              <td>小说作者：雨森焚火</td>
              <td>文章状态：连载中</td>
              <td>最后更新：2026-04-05</td>
              <td>全文长度：1156008字</td>
            </tr>
          </table>
          <table>
            <tr>
              <td><img src="http://img.wenku8.com/image/3/3057/3057s.jpg"></td>
              <td>
                <span class="hottext"><b>作品Tags：校园 欢乐向 青春 恋爱 后宫 妹妹</b></span><br>
                <span class="hottext"><b>作品热度：S级，当前热度上升指数为：S级</b></span><br>
                <span class="hottext">最近章节：</span><br><span><a href="/novel/3/3057/174907.htm">第8.5卷 期待您神圣的一票-石蕗总选举</a></span><br>
                <span class="hottext">内容简介：</span><br><span>平常担任班上背景人物的我──温水和彦。<br>被败北女角──败女所环绕的谜样青春，在此揭幕！</span>
              </td>
            </tr>
          </table>
          <a href="/novel/3/3057/index.htm">小说目录</a>
        </div>
      </div>`;
    const book = parseBookDetails(html, 3057, 'https://www.wenku8.net/book/3057.htm');
    expect(book).toMatchObject({
      title: '败北女角太多了！(败犬女主太多了！)',
      author: '雨森焚火',
      description: '平常担任班上背景人物的我──温水和彦。 被败北女角──败女所环绕的谜样青春，在此揭幕！',
      coverSourceUrl: 'http://img.wenku8.com/image/3/3057/3057s.jpg',
      catalogueUrl: 'https://www.wenku8.net/novel/3/3057/index.htm',
      metadata: {
        category: '小学馆',
        status: '连载中',
        updatedAt: '2026-04-05',
        length: '1156008字',
        tags: '校园 欢乐向 青春 恋爱 后宫 妹妹',
        hotness: 'S级，当前热度上升指数为：S级',
        latestChapter: '第8.5卷 期待您神圣的一票-石蕗总选举',
      },
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

  it('parses rich search result cards from the expected book link', () => {
    const results = parseSearchResults(`
      <div style="width:373px;height:136px;float:left;margin:5px 0px 5px 5px;">
        <div style="width:95px;float:left;">
          <a href="/book/2373.htm" tiptitle="支配异世界的技能掠夺者～从零开始建造奴隶后宫～">
            <img src="http://img.wenku8.com/image/2/2373/2373s.jpg" height="130" width="90">
          </a>
        </div>
        <div style="margin-top:2px;">
          <b><a style="font-size:13px;" href="/book/2373.htm" target="_blank" tiptitle="支配异世界的技能掠夺者～从零开始建造奴隶后宫～">支配异世界的技能掠夺者～从零开始建造奴隶</a></b>
          <p>作者:柑橘ゆすら/分类:讲谈社</p>
          <p>更新:2022-09-07/字数:536K/已完结</p>
          <p>Tags:<span style="font-weight:bold;color: #1b74bc;">穿越 魔法 冒险 龙傲天 后宫</span></p>
          <p>简介:把女人和技能全部抢过来吧──！！</p>
          <p>
            <a href="/book/2373.htm" target="_blank">我要阅读</a> |
            <a href="/modules/article/addbookcase.php?bid=2373" target="_blank">加入书架</a> |
            <a href="/modules/article/uservote.php?id=2373" target="_blank">推荐本书</a>
          </p>
        </div>
      </div>
      <div style="width:373px;height:136px;float:left;margin:5px 0px 5px 5px;">
        <div style="width:95px;float:left;">
          <a href="/book/1861.htm" tiptitle="Re:从零开始的异世界生活">
            <img src="http://img.wenku8.com/image/1/1861/1861s.jpg" height="130" width="90">
          </a>
        </div>
        <div style="margin-top:2px;">
          <b><a style="font-size:13px;" href="/book/1861.htm" target="_blank" tiptitle="Re:从零开始的异世界生活">Re:从零开始的异世界生活</a></b>
          <p>作者:长月达平/分类:MF文库J</p>
          <p>连载中/<span class="hottext">已动画化</span></p>
          <p>Tags:<span style="font-weight:bold;color: #1b74bc;">穿越 战斗 冒险 后宫 人外</span></p>
          <p>简介:走出便利商店要回家的高中生&#8231;菜月昴突然被召唤到异世界。</p>
          <p class="hottext">公告:因版权问题，该书已经下架！</p>
        </div>
      </div>`);
    expect(results).toEqual([
      {
        id: 2373,
        title: '支配异世界的技能掠夺者～从零开始建造奴隶后宫～',
        author: '柑橘ゆすら',
        category: '讲谈社',
        updatedAt: '2022-09-07',
        length: '536K',
        status: '已完结',
        tags: ['穿越', '魔法', '冒险', '龙傲天', '后宫'],
        description: '把女人和技能全部抢过来吧──！！',
      },
      {
        id: 1861,
        title: 'Re:从零开始的异世界生活',
        author: '长月达平',
        category: 'MF文库J',
        status: '连载中/已动画化',
        tags: ['穿越', '战斗', '冒险', '后宫', '人外'],
        description: '走出便利商店要回家的高中生‧菜月昴突然被召唤到异世界。',
        notice: '因版权问题，该书已经下架！',
      },
    ]);
  });

  it('keeps card boundaries when multiple search results share one container', () => {
    const results = parseSearchResults(`
      <td>
        ${searchCard(1861, 'Re:从零开始的异世界生活', '长月达平', 'MF文库J', '连载中', false)}
        ${searchCard(2373, '支配异世界的技能掠夺者～从零开始建造奴隶后宫～', '柑橘ゆすら', '讲谈社', '已完结', true)}
        ${searchCard(1597, '从零开始的魔法书(零之魔法书)', '虎走かける', '电击文库', '已完结', false)}
        ${searchCard(2019, 'CTG-从零开始养育电脑少女', '玩具堂', '角川文库', '已完结', true)}
      </td>`);
    expect(results.map((result) => [result.id, result.title])).toEqual([
      [1861, 'Re:从零开始的异世界生活'],
      [2373, '支配异世界的技能掠夺者～从零开始建造奴隶后宫～'],
      [1597, '从零开始的魔法书(零之魔法书)'],
      [2019, 'CTG-从零开始养育电脑少女'],
    ]);
    expect(results.some((result) => result.title === '我要阅读')).toBe(false);
  });

  it('parses downloadable entries from sugoi award pages', () => {
    const results = parseSugoiResults(`
      <table class="grid">
        <caption>这本轻小说真厉害！2026 文库部门 TOP10</caption>
        <tr><th>
          <div style="TEXT-ALIGN: center; WIDTH: 19%; FLOAT: left">
            <a href="/book/3988.htm" target="_blank" title="玩乐关系"><img src="x"></a><br />
            <a href="/book/3988.htm" target="_blank">玩乐关系</a>
          </div>
          <div style="TEXT-ALIGN: center; WIDTH: 19%; FLOAT: left">
            <a href="#" target="_blank" title="区区转生岂能填补内心的空洞"><img src="x"></a><br />
            <a href="#" target="_blank">区区转生岂能填补内心的空洞</a>
          </div>
          <div style="TEXT-ALIGN: center; WIDTH: 19%; FLOAT: left">
            <a href="/book/3933.htm" target="_blank" title="δ和γ的理学部笔记"><img src="x"></a><br />
            <a href="/book/3933.htm" target="_blank">δ和γ的理学部笔记</a>
          </div>
        </th></tr>
      </table>
      <table class="grid">
        <caption>这本轻小说真厉害！2026 单行本部门 TOP10</caption>
        <tr><th>
          <div style="TEXT-ALIGN: center; WIDTH: 19%; FLOAT: left">
            <a href="/book/2964.htm" target="_blank" title="Silent Witch 沉默魔女的秘密(沉默的魔女)"><img src="x"></a><br />
            <a href="/book/2964.htm" target="_blank">Silent Witch 沉默魔女的秘密(沉默的魔女)</a>
          </div>
        </th></tr>
      </table>`);
    expect(results).toEqual([
      { id: 3988, title: '玩乐关系', category: '文库部门 TOP10', status: '第 1 名' },
      { id: 3933, title: 'δ和γ的理学部笔记', category: '文库部门 TOP10', status: '第 3 名' },
      {
        id: 2964,
        title: 'Silent Witch 沉默魔女的秘密(沉默的魔女)',
        category: '单行本部门 TOP10',
        status: '第 1 名',
      },
    ]);
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

function searchCard(
  id: number,
  title: string,
  author: string,
  category: string,
  status: string,
  withActions: boolean,
): string {
  return `
    <div style="width:373px;height:136px;float:left;margin:5px 0px 5px 5px;">
      <div style="width:95px;float:left;">
        <a href="/book/${id}.htm" tiptitle="${title}">
          <img src="http://img.wenku8.com/image/${id}/${id}s.jpg" height="130" width="90">
        </a>
      </div>
      <div style="margin-top:2px;">
        <b><a style="font-size:13px;" href="/book/${id}.htm" target="_blank" tiptitle="${title}">${title.slice(0, 20)}</a></b>
        <p>作者:${author}/分类:${category}</p>
        <p>${status}</p>
        <p>Tags:<span style="font-weight:bold;color: #1b74bc;">穿越 魔法 冒险</span></p>
        <p>简介:测试简介。</p>
        ${
          withActions
            ? `<p>
                <a href="/book/${id}.htm" target="_blank">我要阅读</a> |
                <a href="/modules/article/addbookcase.php?bid=${id}" target="_blank">加入书架</a> |
                <a href="/modules/article/uservote.php?id=${id}" target="_blank">推荐本书</a>
              </p>`
            : ''
        }
      </div>
    </div>`;
}
