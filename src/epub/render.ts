import type { Asset, Book, Chapter, ContentBlock } from '../domain/book.js';
import { epubImageName } from '../assets/image-store.js';
import { escapeXml, xmlDocument } from './xml.js';

const XHTML_OPEN =
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">';

export function renderChapter(book: Book, chapter: Chapter): string {
  const assets = new Map(book.assets.map((asset) => [asset.id, asset]));
  const content = chapter.blocks.map((block) => renderBlock(block, assets)).join('\n');
  return xmlDocument(`${XHTML_OPEN}
<head><title>${escapeXml(chapter.title)}</title><link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body><section epub:type="chapter"><h1>${escapeXml(chapter.title)}</h1>${content}</section></body>
</html>`);
}

export function renderCover(book: Book): string | undefined {
  const cover = book.assets.find((asset) => asset.id === book.coverAssetId);
  if (!cover) return undefined;
  return xmlDocument(`${XHTML_OPEN}
<head><title>封面</title><link rel="stylesheet" type="text/css" href="styles/book.css"/></head>
<body class="cover"><section epub:type="cover"><img src="images/${escapeXml(epubImageName(cover))}" alt="${escapeXml(book.title)}"/></section></body>
</html>`);
}

export function renderNavigation(book: Book, chapterFiles: Map<string, string>): string {
  const volumes = book.volumes
    .map((volume) => {
      const chapters = volume.chapters
        .map(
          (chapter) =>
            `<li><a href="text/${chapterFiles.get(chapter.id) ?? ''}">${escapeXml(chapter.title)}</a></li>`,
        )
        .join('');
      return `<li><span>${escapeXml(volume.title)}</span><ol>${chapters}</ol></li>`;
    })
    .join('');
  return xmlDocument(`${XHTML_OPEN}
<head><title>目录</title></head><body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>${volumes}</ol></nav></body>
</html>`);
}

function renderBlock(block: ContentBlock, assets: Map<string, Asset>): string {
  if (block.type === 'separator') return '<hr/>';
  if (block.type === 'image') {
    const asset = block.assetId ? assets.get(block.assetId) : undefined;
    if (!asset) return `<p class="missing-image">【${escapeXml(block.alt)}】</p>`;
    return `<figure><img src="../images/${escapeXml(epubImageName(asset))}" alt="${escapeXml(block.alt)}"/></figure>`;
  }
  if (block.type === 'heading') {
    const level = Math.min(6, Math.max(2, block.level ?? 2));
    return `<h${level}>${escapeXml(block.text)}</h${level}>`;
  }
  const className = block.type === 'note' ? ' class="note"' : '';
  return `<p${className}>${escapeXml(block.text)}</p>`;
}
