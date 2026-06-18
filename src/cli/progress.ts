import type { ProgressEvent } from '../service/downloader.js';

export function printProgress(event: ProgressEvent): void {
  const count = event.total ? ` ${event.completed ?? 0}/${event.total}` : '';
  process.stderr.write(`[${event.phase}]${count} ${event.message}\n`);
}
