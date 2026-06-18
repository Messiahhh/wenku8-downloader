import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpClient } from './client.js';

describe('HttpClient', () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    servers.length = 0;
  });

  it('reports Cloudflare challenges with an actionable error', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(403, { 'cf-mitigated': 'challenge' });
      response.end('challenge');
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const client = new HttpClient({ retries: 0, timeoutMs: 1_000 });
    await expect(client.text(`http://127.0.0.1:${address.port}/`)).rejects.toThrow(
      /Cloudflare challenge/,
    );
    expect(client.stats()).toMatchObject({ fetchRequests: 1, cloudflareChallenges: 1 });
  });

  it('tracks 429 responses and automatic retries', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests += 1;
      if (requests === 1) {
        response.writeHead(429);
        response.end('rate limited');
        return;
      }
      response.writeHead(200);
      response.end('ok');
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    const retryEvents: Array<{ status?: number; retriesLeft: number; attemptNumber: number }> = [];
    const client = new HttpClient({
      retries: 1,
      timeoutMs: 1_000,
      minDelayMs: 1,
      rateLimitCooldownMs: 1,
      onRetry: (event) => retryEvents.push(event),
    });

    await expect(client.text(`http://127.0.0.1:${address.port}/`, 'utf-8')).resolves.toBe('ok');
    expect(client.stats()).toMatchObject({
      fetchRequests: 2,
      http429Responses: 1,
      retryableFailures: 1,
      automaticRetries: 1,
      rateLimitCooldowns: 1,
      statusCodes: { '200': 1, '429': 1 },
    });
    expect(retryEvents).toMatchObject([{ status: 429, retriesLeft: 1, attemptNumber: 1 }]);
  });
});
