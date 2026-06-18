import { createHash } from 'node:crypto';

export function stableId(value: string, length = 16): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

export function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function parseBookReference(value: string): number {
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) return Number(normalized);

  const match = /wenku8\.net\/book\/(\d+)\.htm(?:[?#].*)?$/i.exec(normalized);
  if (!match?.[1]) throw new Error(`无法识别小说 ID 或 URL：${value}`);
  return Number(match[1]);
}
