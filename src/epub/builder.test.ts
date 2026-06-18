import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { Book } from '../domain/book.js';
import { sha256 } from '../domain/ids.js';
import { EpubBuilder } from './builder.js';

const execFileAsync = promisify(execFile);

describe('EpubBuilder', () => {
  it('builds an EPUB with the uncompressed mimetype entry first', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'wenku8-epub-'));
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
    await writeFile(path.join(root, 'image.jpg'), image);
    const book: Book = {
      id: 1,
      title: '测试书',
      author: '作者',
      language: 'zh-CN',
      description: '简介',
      sourceUrl: 'https://example/book/1',
      catalogueUrl: 'https://example/book/1/index',
      metadata: {},
      coverAssetId: 'a1',
      assets: [
        {
          id: 'a1',
          sourceUrl: 'https://example/image.jpg',
          relativePath: 'image.jpg',
          mediaType: 'image/jpeg',
          sha256: sha256(image),
          bytes: image.byteLength,
          width: 8,
          height: 8,
          role: 'cover',
        },
      ],
      volumes: [
        {
          id: 'v1',
          index: 0,
          title: '第一卷',
          chapters: [
            {
              id: 'c1',
              index: 0,
              title: '第一章',
              sourceUrl: 'https://example/c1',
              blocks: [
                { type: 'paragraph', text: '正文内容' },
                {
                  type: 'image',
                  sourceUrl: 'https://example/image.jpg',
                  assetId: 'a1',
                  alt: '插图',
                },
              ],
            },
          ],
        },
      ],
    };
    const output = path.join(root, 'book.epub');
    await new EpubBuilder().build(book, root, output);
    const zip = await readFile(output);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt16LE(8)).toBe(0);
    const filenameLength = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + filenameLength).toString()).toBe('mimetype');
    expect(zip.byteLength).toBeGreaterThan(1000);
    if (process.env.CI_EPUBCHECK === '1') await execFileAsync('epubcheck', [output]);
  });
});
