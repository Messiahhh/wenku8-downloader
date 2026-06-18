import path from 'node:path';

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function safeFilename(value: string, fallback = 'untitled'): string {
  const normalized = value
    .normalize('NFKC')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = normalized && !WINDOWS_RESERVED.test(normalized) ? normalized : fallback;
  return safe.slice(0, 120);
}

export function outputEpubPath(outputDirectory: string, title: string): string {
  return path.resolve(outputDirectory, `${safeFilename(title, 'book')}.epub`);
}
