import { IncompleteBookError } from './errors.js';
import type { Book } from './book.js';

export function validateBookCompleteness(book: Book, allowMissingImages = false): void {
  const issues: string[] = [];
  const assets = new Map(book.assets.map((asset) => [asset.id, asset]));

  if (book.volumes.length === 0) issues.push('目录中没有卷');
  if (book.volumes.every((volume) => volume.chapters.length === 0)) issues.push('目录中没有章节');

  for (const volume of book.volumes) {
    for (const chapter of volume.chapters) {
      if (chapter.blocks.length === 0) issues.push(`${volume.title} / ${chapter.title} 没有正文`);
      for (const block of chapter.blocks) {
        if (block.type !== 'image') continue;
        if (!block.sourceUrl) {
          issues.push(`${volume.title} / ${chapter.title} 存在无法定位来源的图片占位符`);
        } else if (!block.assetId || !assets.has(block.assetId)) {
          issues.push(`${volume.title} / ${chapter.title} 缺少图片 ${block.sourceUrl}`);
        }
      }
    }
  }

  if (book.coverSourceUrl && (!book.coverAssetId || !assets.has(book.coverAssetId))) {
    issues.push(`封面下载失败：${book.coverSourceUrl}`);
  }

  if (issues.length > 0 && !allowMissingImages) throw new IncompleteBookError(issues);
}
