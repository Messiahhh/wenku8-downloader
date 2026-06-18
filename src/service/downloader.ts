import path from 'node:path';
import type { Asset, Book, Chapter, Volume } from '../domain/book.js';
import { CopyrightUnavailableError, IncompleteBookError } from '../domain/errors.js';
import { sha256 } from '../domain/ids.js';
import { EpubBuilder } from '../epub/builder.js';
import { ImageStore } from '../assets/image-store.js';
import { outputEpubPath } from '../storage/paths.js';
import { BookWorkspace } from '../storage/workspace.js';
import { parseBookDetails, parseCatalogue } from '../site/parser.js';
import { isCopyrightUnavailable, Wenku8Client } from '../site/client.js';

export interface DownloadOptions {
  workDirectory?: string;
  outputDirectory?: string;
  chapterConcurrency?: number;
  chapterRetryRounds?: number;
  chapterRetryDelayMs?: number;
  allowMissingImages?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  phase: 'metadata' | 'chapters' | 'images' | 'epub';
  message: string;
  completed?: number;
  total?: number;
}

export interface DownloadResult {
  book: Book;
  epubPath: string;
  workspaceDirectory: string;
}

interface ChapterTask {
  volume: Volume;
  chapter: Chapter;
  index: number;
}

export class Downloader {
  constructor(
    private readonly client = new Wenku8Client(),
    private readonly epubBuilder = new EpubBuilder(),
  ) {}

  async download(bookId: number, options: DownloadOptions = {}): Promise<DownloadResult> {
    const workDirectory = path.resolve(options.workDirectory ?? 'downloads');
    const outputDirectory = path.resolve(options.outputDirectory ?? 'downloads');
    const workspace = await BookWorkspace.open(workDirectory, bookId);
    const emit = (event: ProgressEvent) => options.onProgress?.(event);

    emit({ phase: 'metadata', message: '获取小说详情' });
    const details = await this.loadDetails(workspace, bookId, options.signal);
    await workspace.setTitle(details.title);
    emit({ phase: 'metadata', message: '获取小说目录' });
    const volumes = await this.loadCatalogue(workspace, details.catalogueUrl, options.signal);

    const chapterCount = volumes.reduce((total, volume) => total + volume.chapters.length, 0);
    let completedChapters = 0;
    const chapterTasks = volumes.flatMap((volume) =>
      volume.chapters.map((chapter, index) => ({ volume, chapter, index })),
    );
    const chapterConcurrency = Math.min(
      options.chapterConcurrency ?? 3,
      Math.max(chapterTasks.length, 1),
    );
    const chapterRetryRounds = options.chapterRetryRounds ?? 2;
    let pendingChapterTasks = chapterTasks;
    let chapterFailures: Array<{ task: ChapterTask; error: unknown }> = [];

    for (let round = 0; round <= chapterRetryRounds; round += 1) {
      chapterFailures = [];
      const chapterAbort = new AbortController();
      const chapterSignal = options.signal
        ? AbortSignal.any([options.signal, chapterAbort.signal])
        : chapterAbort.signal;
      let nextChapterIndex = 0;
      let fatalChapterError: unknown;
      const runChapterWorker = async () => {
        while (!fatalChapterError && !chapterSignal.aborted) {
          const task = pendingChapterTasks[nextChapterIndex];
          nextChapterIndex += 1;
          if (!task) return;
          let taskError: unknown;
          try {
            task.volume.chapters[task.index] = await this.loadChapter(
              workspace,
              task.chapter,
              chapterSignal,
            );
          } catch (error) {
            taskError = error;
            if (error instanceof CopyrightUnavailableError) {
              if (!fatalChapterError) {
                fatalChapterError = error;
                chapterAbort.abort(error);
                throw error;
              }
              return;
            }
            if (!chapterSignal.aborted) {
              chapterFailures.push({ task, error });
            }
          } finally {
            if (!fatalChapterError || taskError === fatalChapterError) {
              completedChapters += 1;
              emit({
                phase: 'chapters',
                message: round === 0 ? task.chapter.title : `重试 ${round}: ${task.chapter.title}`,
                completed: Math.min(completedChapters, chapterCount),
                total: chapterCount,
              });
            }
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(chapterConcurrency, pendingChapterTasks.length) }, () =>
          runChapterWorker(),
        ),
      );
      if (chapterFailures.length === 0) break;
      if (round === chapterRetryRounds) break;
      await delay(options.chapterRetryDelayMs ?? 15_000, options.signal);
      pendingChapterTasks = chapterFailures.map((failure) => failure.task);
    }
    if (chapterFailures.length > 0) {
      throw new IncompleteBookError(
        chapterFailures.map(
          ({ task, error }) => `${task.volume.title} / ${task.chapter.title}: ${errorMessage(error)}`,
        ),
      );
    }

    const book: Book = { ...details, volumes, assets: [] };
    const imageStore = new ImageStore(this.client.http, workspace);
    const assets = new Map<string, Promise<Asset>>();
    if (book.coverSourceUrl) {
      assets.set(
        book.coverSourceUrl,
        imageStore.acquire(book.coverSourceUrl, 'cover', options.signal),
      );
    }
    for (const volume of book.volumes) {
      for (const chapter of volume.chapters) {
        for (const block of chapter.blocks) {
          if (block.type === 'image' && block.sourceUrl && !assets.has(block.sourceUrl)) {
            assets.set(
              block.sourceUrl,
              imageStore.acquire(block.sourceUrl, 'illustration', options.signal),
            );
          }
        }
      }
    }

    let completedImages = 0;
    const acquired = new Map<string, Asset>();
    await Promise.all(
      [...assets.entries()].map(async ([url, task]) => {
        try {
          acquired.set(url, await task);
        } catch {
          // Missing assets remain unresolved and are reported by the completeness validator.
        } finally {
          completedImages += 1;
          emit({
            phase: 'images',
            message: url,
            completed: completedImages,
            total: assets.size,
          });
        }
      }),
    );
    book.assets = [...acquired.values()];
    const coverAssetId = book.coverSourceUrl ? acquired.get(book.coverSourceUrl)?.id : undefined;
    if (coverAssetId) book.coverAssetId = coverAssetId;
    for (const volume of book.volumes) {
      for (const chapter of volume.chapters) {
        for (const block of chapter.blocks) {
          if (block.type === 'image' && block.sourceUrl) {
            const assetId = acquired.get(block.sourceUrl)?.id;
            if (assetId) block.assetId = assetId;
          }
        }
      }
    }
    await workspace.writeBook(book);

    emit({ phase: 'epub', message: '构建并校验 EPUB' });
    const epubPath = outputEpubPath(outputDirectory, book.title);
    const epubKey = 'epub';
    const previousEpub = workspace.resource(epubKey);
    await workspace.mark(epubKey, {
      kind: 'epub',
      relativePath: epubPath,
      state: 'running',
      attempts: (previousEpub?.attempts ?? 0) + 1,
    });
    try {
      await this.epubBuilder.build(book, workspace.directory, epubPath, {
        allowMissingImages: options.allowMissingImages ?? false,
      });
      const output = new Uint8Array(
        await import('node:fs/promises').then(({ readFile }) => readFile(epubPath)),
      );
      await workspace.mark(epubKey, {
        kind: 'epub',
        relativePath: epubPath,
        state: 'complete',
        attempts: (previousEpub?.attempts ?? 0) + 1,
        bytes: output.byteLength,
        sha256: sha256(output),
      });
      return { book, epubPath, workspaceDirectory: workspace.directory };
    } catch (error) {
      await workspace.mark(epubKey, {
        kind: 'epub',
        relativePath: epubPath,
        state: 'failed',
        attempts: (previousEpub?.attempts ?? 0) + 1,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  private async loadDetails(workspace: BookWorkspace, bookId: number, signal?: AbortSignal) {
    const key = 'detail';
    const relativePath = 'raw/detail.html';
    const existing = workspace.resource(key);
    if (existing?.state === 'complete' && (await workspace.exists(relativePath))) {
      const sourceUrl = `https://www.wenku8.net/book/${bookId}.htm`;
      return parseBookDetails(await workspace.readText(relativePath), bookId, sourceUrl);
    }
    await workspace.mark(key, {
      kind: 'detail',
      state: 'running',
      attempts: (existing?.attempts ?? 0) + 1,
    });
    try {
      const { book, raw } = await this.client.getBookDetails(bookId, signal);
      await workspace.writeAtomic(relativePath, raw);
      await workspace.mark(key, {
        kind: 'detail',
        sourceUrl: book.sourceUrl,
        relativePath,
        state: 'complete',
        attempts: (existing?.attempts ?? 0) + 1,
        bytes: Buffer.byteLength(raw),
      });
      return book;
    } catch (error) {
      await workspace.mark(key, {
        kind: 'detail',
        state: 'failed',
        attempts: (existing?.attempts ?? 0) + 1,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  private async loadCatalogue(
    workspace: BookWorkspace,
    url: string,
    signal?: AbortSignal,
  ): Promise<Volume[]> {
    const key = 'catalogue';
    const relativePath = 'raw/catalogue.html';
    const existing = workspace.resource(key);
    if (existing?.state === 'complete' && (await workspace.exists(relativePath))) {
      return parseCatalogue(await workspace.readText(relativePath), url);
    }
    await workspace.mark(key, {
      kind: 'catalogue',
      sourceUrl: url,
      state: 'running',
      attempts: (existing?.attempts ?? 0) + 1,
    });
    try {
      const { volumes, raw } = await this.client.getCatalogue(url, signal);
      await workspace.writeAtomic(relativePath, raw);
      await workspace.mark(key, {
        kind: 'catalogue',
        sourceUrl: url,
        relativePath,
        state: 'complete',
        attempts: (existing?.attempts ?? 0) + 1,
        bytes: Buffer.byteLength(raw),
      });
      return volumes;
    } catch (error) {
      await workspace.mark(key, {
        kind: 'catalogue',
        sourceUrl: url,
        state: 'failed',
        attempts: (existing?.attempts ?? 0) + 1,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  private async loadChapter(
    workspace: BookWorkspace,
    chapter: Chapter,
    signal?: AbortSignal,
  ): Promise<Chapter> {
    const key = `chapter:${chapter.id}`;
    const jsonPath = `chapters/${chapter.id}.json`;
    const rawPath = `raw/chapters/${chapter.id}.html`;
    const existing = workspace.resource(key);
    if (existing?.state === 'complete' && (await workspace.exists(jsonPath))) {
      if ((await workspace.exists(rawPath)) && isCopyrightUnavailable(await workspace.readText(rawPath))) {
        throw new CopyrightUnavailableError(chapter.title, chapter.sourceUrl);
      }
      return workspace.readJson<Chapter>(jsonPath);
    }
    await workspace.mark(key, {
      kind: 'chapter',
      sourceUrl: chapter.sourceUrl,
      state: 'running',
      attempts: (existing?.attempts ?? 0) + 1,
    });
    try {
      const result = await this.client.getChapter(chapter, signal);
      await Promise.all([
        workspace.writeAtomic(rawPath, result.raw),
        workspace.writeJson(jsonPath, result.chapter),
      ]);
      await workspace.mark(key, {
        kind: 'chapter',
        sourceUrl: chapter.sourceUrl,
        relativePath: jsonPath,
        state: 'complete',
        attempts: (existing?.attempts ?? 0) + 1,
        bytes: Buffer.byteLength(result.raw),
      });
      return result.chapter;
    } catch (error) {
      await workspace.mark(key, {
        kind: 'chapter',
        sourceUrl: chapter.sourceUrl,
        state: 'failed',
        attempts: (existing?.attempts ?? 0) + 1,
        error: errorMessage(error),
      });
      throw error;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(delayAbortReason(signal));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(signal ? delayAbortReason(signal) : new Error('用户取消'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function delayAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('用户取消');
}
