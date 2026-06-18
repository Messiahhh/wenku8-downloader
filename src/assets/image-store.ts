import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Asset } from '../domain/book.js';
import { sha256, stableId } from '../domain/ids.js';
import type { HttpClient } from '../http/client.js';
import type { BookWorkspace } from '../storage/workspace.js';

export class ImageStore {
  constructor(
    private readonly http: HttpClient,
    private readonly workspace: BookWorkspace,
  ) {}

  async acquire(sourceUrl: string, role: Asset['role'], signal?: AbortSignal): Promise<Asset> {
    const id = stableId(sourceUrl, 24);
    const key = `${role}:${id}`;
    const existing = this.workspace.resource(key);
    if (existing?.state === 'complete' && existing.relativePath && (await this.workspace.exists(existing.relativePath))) {
      return this.inspectExisting(id, sourceUrl, existing.relativePath, role);
    }

    await this.workspace.mark(key, {
      kind: role === 'cover' ? 'cover' : 'image',
      sourceUrl,
      state: 'running',
      attempts: (existing?.attempts ?? 0) + 1,
    });

    try {
      const { data } = await this.http.bytes(sourceUrl, signal);
      const normalized = await normalizeImage(data);
      const relativePath = `assets/${role === 'cover' ? 'cover' : 'images'}/${id}.${normalized.extension}`;
      await this.workspace.writeAtomic(relativePath, normalized.data);
      const digest = sha256(normalized.data);
      await this.workspace.mark(key, {
        kind: role === 'cover' ? 'cover' : 'image',
        sourceUrl,
        relativePath,
        state: 'complete',
        attempts: (existing?.attempts ?? 0) + 1,
        bytes: normalized.data.byteLength,
        sha256: digest,
      });
      return {
        id,
        sourceUrl,
        relativePath,
        mediaType: normalized.mediaType,
        sha256: digest,
        bytes: normalized.data.byteLength,
        ...(normalized.width ? { width: normalized.width } : {}),
        ...(normalized.height ? { height: normalized.height } : {}),
        role,
      };
    } catch (error) {
      await this.workspace.mark(key, {
        kind: role === 'cover' ? 'cover' : 'image',
        sourceUrl,
        state: 'failed',
        attempts: (existing?.attempts ?? 0) + 1,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  private async inspectExisting(
    id: string,
    sourceUrl: string,
    relativePath: string,
    role: Asset['role'],
  ): Promise<Asset> {
    const data = await readFile(this.workspace.resolve(relativePath));
    const metadata = await sharp(data, { animated: true }).metadata();
    return {
      id,
      sourceUrl,
      relativePath,
      mediaType: mediaTypeFor(metadata.format),
      sha256: sha256(data),
      bytes: data.byteLength,
      ...(metadata.width ? { width: metadata.width } : {}),
      ...(metadata.height ? { height: metadata.height } : {}),
      role,
    };
  }
}

async function normalizeImage(input: Uint8Array): Promise<{
  data: Uint8Array;
  extension: string;
  mediaType: string;
  width?: number;
  height?: number;
}> {
  const pipeline = sharp(input, { animated: true, failOn: 'error' });
  const metadata = await pipeline.metadata();
  if (!metadata.format || !metadata.width || !metadata.height) throw new Error('响应不是可解码的图片');

  let data = input;
  let format = metadata.format;
  if (!['jpeg', 'png', 'gif'].includes(format)) {
    data = await sharp(input).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    format = 'jpeg';
  }
  return {
    data,
    extension: format === 'jpeg' ? 'jpg' : format,
    mediaType: mediaTypeFor(format),
    width: metadata.width,
    height: metadata.height,
  };
}

function mediaTypeFor(format?: string): string {
  if (format === 'jpeg' || format === 'jpg') return 'image/jpeg';
  if (format === 'png') return 'image/png';
  if (format === 'gif') return 'image/gif';
  throw new Error(`不支持的图片格式：${format ?? 'unknown'}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function epubImageName(asset: Asset): string {
  return path.basename(asset.relativePath);
}
