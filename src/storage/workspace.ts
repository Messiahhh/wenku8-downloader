import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Book } from '../domain/book.js';
import { manifestSchema, type Manifest, type ResourceRecord } from './schema.js';

const now = () => new Date().toISOString();

export class BookWorkspace {
  readonly directory: string;
  readonly rawDirectory: string;
  readonly chapterDirectory: string;
  readonly assetDirectory: string;
  readonly packageDirectory: string;
  readonly manifestPath: string;
  readonly bookPath: string;
  private manifestWrite = Promise.resolve();

  private constructor(
    rootDirectory: string,
    readonly bookId: number,
    private manifest: Manifest,
  ) {
    this.directory = path.resolve(rootDirectory, String(bookId));
    this.rawDirectory = path.join(this.directory, 'raw');
    this.chapterDirectory = path.join(this.directory, 'chapters');
    this.assetDirectory = path.join(this.directory, 'assets');
    this.packageDirectory = path.join(this.directory, 'epub');
    this.manifestPath = path.join(this.directory, 'manifest.json');
    this.bookPath = path.join(this.directory, 'book.json');
  }

  static async open(rootDirectory: string, bookId: number): Promise<BookWorkspace> {
    const directory = path.resolve(rootDirectory, String(bookId));
    const manifestPath = path.join(directory, 'manifest.json');
    let manifest: Manifest;
    try {
      manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      const timestamp = now();
      manifest = {
        version: 1,
        bookId,
        createdAt: timestamp,
        updatedAt: timestamp,
        resources: {},
      };
    }

    const workspace = new BookWorkspace(rootDirectory, bookId, manifest);
    await Promise.all([
      mkdir(path.join(workspace.rawDirectory, 'chapters'), { recursive: true }),
      mkdir(path.join(workspace.assetDirectory, 'images'), { recursive: true }),
      mkdir(workspace.chapterDirectory, { recursive: true }),
      mkdir(workspace.packageDirectory, { recursive: true }),
    ]);
    await workspace.saveManifest();
    return workspace;
  }

  snapshot(): Manifest {
    return structuredClone(this.manifest);
  }

  resource(key: string): ResourceRecord | undefined {
    return this.manifest.resources[key];
  }

  async mark(
    key: string,
    update: Omit<ResourceRecord, 'key' | 'updatedAt'>,
  ): Promise<ResourceRecord> {
    const record: ResourceRecord = { key, updatedAt: now(), ...update };
    this.manifest.resources[key] = record;
    await this.saveManifest();
    return record;
  }

  async setTitle(title: string): Promise<void> {
    this.manifest.title = title;
    await this.saveManifest();
  }

  async writeJson(relativePath: string, value: unknown): Promise<void> {
    await this.writeAtomic(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  async readText(relativePath: string): Promise<string> {
    return readFile(this.resolve(relativePath), 'utf8');
  }

  async readJson<T>(relativePath: string): Promise<T> {
    return JSON.parse(await this.readText(relativePath)) as T;
  }

  async writeAtomic(relativePath: string, data: string | Uint8Array): Promise<string> {
    const target = this.resolve(relativePath);
    const temporary = `${target}.part-${process.pid}`;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(temporary, data);
    await rename(temporary, target);
    return target;
  }

  async readBook(): Promise<Book | undefined> {
    try {
      return JSON.parse(await readFile(this.bookPath, 'utf8')) as Book;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  async writeBook(book: Book): Promise<void> {
    await this.writeJson('book.json', book);
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await stat(this.resolve(relativePath));
      return true;
    } catch (error) {
      if (isMissingFile(error)) return false;
      throw error;
    }
  }

  resolve(relativePath: string): string {
    const target = path.resolve(this.directory, relativePath);
    if (target !== this.directory && !target.startsWith(`${this.directory}${path.sep}`)) {
      throw new Error(`Path escapes workspace: ${relativePath}`);
    }
    return target;
  }

  async clearPackageDirectory(): Promise<void> {
    await rm(this.packageDirectory, { recursive: true, force: true });
    await mkdir(this.packageDirectory, { recursive: true });
  }

  private async saveManifest(): Promise<void> {
    this.manifest.updatedAt = now();
    this.manifestWrite = this.manifestWrite
      .catch(() => undefined)
      .then(() => this.writeAtomic('manifest.json', `${JSON.stringify(this.manifest, null, 2)}\n`))
      .then(() => undefined);
    await this.manifestWrite;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
