import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { Wenku8Client } from '../site/client.js';
import { parseBookDetails, parseCatalogue, type BookDetails } from '../site/parser.js';
import type { Chapter, Volume } from '../domain/book.js';
import { CopyrightUnavailableError } from '../domain/errors.js';
import { manifestSchema } from '../storage/schema.js';
import { Downloader } from './downloader.js';

describe('Downloader', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    servers.length = 0;
  });

  it('downloads assets, builds an EPUB and reuses the completed workspace', async () => {
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    let imageRequests = 0;
    const server = createServer((_request, response) => {
      imageRequests += 1;
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(image);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const imageUrl = `http://127.0.0.1:${address.port}/image.png`;

    class FixtureClient extends Wenku8Client {
      constructor() {
        super({ concurrency: 2, retries: 0, timeoutMs: 2_000, requestsPerSecond: 20 });
      }

      override getBookDetails(bookId: number): Promise<{ book: BookDetails; raw: string }> {
        const raw = `<div id="content"><span><b>端到端测试</b></span><div>小说作者：测试作者</div><img src="${imageUrl}"><a href="/novel/42/index.htm">目录</a><div id="contentmain">测试简介</div></div>`;
        return Promise.resolve({
          raw,
          book: parseBookDetails(raw, bookId, `https://www.wenku8.net/book/${bookId}.htm`),
        });
      }

      override getCatalogue(): Promise<{ volumes: Volume[]; raw: string }> {
        const raw =
          '<table><tr><td colspan="4">第一卷</td></tr><tr><td><a href="1.htm">第一章</a></td></tr></table>';
        return Promise.resolve({
          raw,
          volumes: parseCatalogue(raw, 'https://www.wenku8.net/novel/42/index.htm'),
        });
      }

      override getChapter(chapter: Chapter): Promise<{ chapter: Chapter; raw: string }> {
        return Promise.resolve({
          raw: '<div id="content">正文</div>',
          chapter: {
            ...chapter,
            blocks: [
              { type: 'paragraph', text: '正文' },
              { type: 'image', sourceUrl: imageUrl, alt: '插图' },
            ],
          },
        });
      }
    }

    const root = await mkdtemp(path.join(os.tmpdir(), 'wenku8-download-'));
    const downloader = new Downloader(new FixtureClient());
    const first = await downloader.download(42, { workDirectory: root, outputDirectory: root });
    expect((await readFile(first.epubPath)).byteLength).toBeGreaterThan(1000);
    expect(imageRequests).toBe(1);

    const second = await downloader.download(42, { workDirectory: root, outputDirectory: root });
    expect(second.epubPath).toBe(first.epubPath);
    expect(imageRequests).toBe(1);
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(path.join(root, '42', 'manifest.json'), 'utf8')),
    );
    expect(manifest.resources.epub?.state).toBe('complete');
    expect(
      Object.values(manifest.resources).every((resource) => resource.state === 'complete'),
    ).toBe(true);
  });

  it('stops immediately when a chapter is unavailable for copyright reasons', async () => {
    let chapterRequests = 0;

    class CopyrightClient extends Wenku8Client {
      constructor() {
        super({ concurrency: 2, retries: 0, timeoutMs: 2_000, requestsPerSecond: 20 });
      }

      override getBookDetails(bookId: number): Promise<{ book: BookDetails; raw: string }> {
        const raw = `<div id="content"><span><b>版权测试</b></span><div>小说作者：测试作者</div><a href="/novel/42/index.htm">目录</a><div id="contentmain">测试简介</div></div>`;
        return Promise.resolve({
          raw,
          book: parseBookDetails(raw, bookId, `https://www.wenku8.net/book/${bookId}.htm`),
        });
      }

      override getCatalogue(): Promise<{ volumes: Volume[]; raw: string }> {
        const raw = `<table>
          <tr><td colspan="4">第一卷</td></tr>
          <tr>
            <td><a href="1.htm">第一章</a></td>
            <td><a href="2.htm">第二章</a></td>
            <td><a href="3.htm">第三章</a></td>
            <td><a href="4.htm">第四章</a></td>
            <td><a href="5.htm">第五章</a></td>
          </tr>
        </table>`;
        return Promise.resolve({
          raw,
          volumes: parseCatalogue(raw, 'https://www.wenku8.net/novel/42/index.htm'),
        });
      }

      override async getChapter(
        chapter: Chapter,
        signal?: AbortSignal,
      ): Promise<{ chapter: Chapter; raw: string }> {
        chapterRequests += 1;
        if (chapter.title !== '第一章') {
          await new Promise<void>((resolve) => {
            if (signal?.aborted) {
              resolve();
              return;
            }
            signal?.addEventListener('abort', () => resolve(), { once: true });
          });
        }
        throw new CopyrightUnavailableError(chapter.title, chapter.sourceUrl);
      }
    }

    const root = await mkdtemp(path.join(os.tmpdir(), 'wenku8-copyright-'));
    await expect(
      new Downloader(new CopyrightClient()).download(42, {
        workDirectory: root,
        chapterConcurrency: 2,
      }),
    ).rejects.toThrow(/因版权问题/);
    expect(chapterRequests).toBeLessThanOrEqual(2);
  });
});
