import { spawn } from 'node:child_process';
import PQueue from 'p-queue';
import pRetry, { AbortError } from 'p-retry';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import { CloudflareChallengeError, HttpStatusError } from '../domain/errors.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface HttpClientOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
  minDelayMs?: number;
  requestsPerSecond?: number;
  preferCurl?: boolean;
  rateLimitCooldownMs?: number;
  cookie?: string;
  userAgent?: string;
}

export interface HttpClientStats {
  fetchRequests: number;
  curlRequests: number;
  cloudflareChallenges: number;
  curlFallbacks: number;
  http429Responses: number;
  retryableFailures: number;
  automaticRetries: number;
  rateLimitCooldowns: number;
  rateLimitCooldownWaitMs: number;
  statusCodes: Record<string, number>;
}

export class HttpClient {
  private readonly queue: PQueue;
  private readonly fetchWithCookies: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly minDelayMs: number;
  private readonly headers: HeadersInit;
  private readonly cookie: string | undefined;
  private readonly userAgent: string;
  private readonly rateLimitCooldownMs: number;
  private readonly rateLimitUntil = new Map<string, number>();
  private useCurlTransport = false;
  private readonly requestStats: HttpClientStats = {
    fetchRequests: 0,
    curlRequests: 0,
    cloudflareChallenges: 0,
    curlFallbacks: 0,
    http429Responses: 0,
    retryableFailures: 0,
    automaticRetries: 0,
    rateLimitCooldowns: 0,
    rateLimitCooldownWaitMs: 0,
    statusCodes: {},
  };

  constructor(options: HttpClientOptions = {}) {
    this.queue = new PQueue({
      concurrency: options.concurrency ?? 3,
      intervalCap: options.requestsPerSecond ?? 1,
      interval: 1000,
      strict: true,
    });
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retries = options.retries ?? 4;
    this.minDelayMs = options.minDelayMs ?? 800;
    this.rateLimitCooldownMs = options.rateLimitCooldownMs ?? 15_000;
    const jar = new CookieJar();
    this.fetchWithCookies = makeFetchCookie(fetch, jar);
    this.cookie = options.cookie?.trim();
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.useCurlTransport = options.preferCurl ?? false;
    this.headers = {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'upgrade-insecure-requests': '1',
      'user-agent': this.userAgent,
      ...(this.cookie ? { cookie: this.cookie } : {}),
    };
  }

  async bytes(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ data: Uint8Array; response: Response }> {
    return this.queue.add(async () =>
      pRetry(
        async () => {
          if (signal?.aborted) throw new AbortError(abortReason(signal));
          await this.waitForRateLimitCooldown(url, signal);
          if (this.useCurlTransport) return this.curlBytes(url, signal);

          try {
            return await this.fetchBytes(url, signal);
          } catch (error) {
            if (this.cookie && error instanceof CloudflareChallengeError) {
              this.useCurlTransport = true;
              this.requestStats.curlFallbacks += 1;
              return this.curlBytes(url, signal);
            }
            throw error;
          }
        },
        {
          retries: this.retries,
          minTimeout: this.minDelayMs,
          maxTimeout: 10_000,
          factor: 2,
          randomize: true,
          onFailedAttempt: ({ retriesLeft }) => {
            if (retriesLeft > 0) this.requestStats.automaticRetries += 1;
          },
        },
      ),
    );
  }

  private async fetchBytes(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ data: Uint8Array; response: Response }> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    this.requestStats.fetchRequests += 1;
    const response = await this.fetchWithCookies(url, {
      headers: this.headers,
      redirect: 'follow',
      signal: combinedSignal,
    });
    this.recordStatus(response.status);
    if (!response.ok) {
      if (response.headers.get('cf-mitigated') === 'challenge') {
        this.requestStats.cloudflareChallenges += 1;
        throw new CloudflareChallengeError(url);
      }
      if (response.status === 429) {
        this.requestStats.http429Responses += 1;
        this.applyRateLimitCooldown(url, retryAfterMs(response.headers.get('retry-after')));
      }
      if (isRetryableStatus(response.status)) this.requestStats.retryableFailures += 1;
      const error = new HttpStatusError(url, response.status);
      if (!isRetryableStatus(response.status)) throw new AbortError(error);
      throw error;
    }
    return { data: new Uint8Array(await response.arrayBuffer()), response };
  }

  private async curlBytes(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ data: Uint8Array; response: Response }> {
    const curlOptions: CurlOptions = {
      timeoutMs: this.timeoutMs,
      userAgent: this.userAgent,
    };
    if (this.cookie) curlOptions.cookie = this.cookie;
    if (signal) curlOptions.signal = signal;
    this.requestStats.curlRequests += 1;
    const output = await runCurl(url, curlOptions);
    this.recordStatus(output.status);
    if (!isSuccessfulStatus(output.status)) {
      if (output.status === 403) this.requestStats.cloudflareChallenges += 1;
      if (output.status === 429) {
        this.requestStats.http429Responses += 1;
        this.applyRateLimitCooldown(url);
      }
      if (isRetryableStatus(output.status)) this.requestStats.retryableFailures += 1;
      const error =
        output.status === 403
          ? new CloudflareChallengeError(url)
          : new HttpStatusError(url, output.status);
      if (!isRetryableStatus(output.status) || output.status === 403) throw new AbortError(error);
      throw error;
    }
    return { data: output.data, response: new Response(null, { status: output.status }) };
  }

  async text(url: string, encoding = 'gb18030', signal?: AbortSignal): Promise<string> {
    const { data } = await this.bytes(url, signal);
    return new TextDecoder(encoding).decode(data);
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  stats(): HttpClientStats {
    return {
      ...this.requestStats,
      statusCodes: { ...this.requestStats.statusCodes },
    };
  }

  private recordStatus(status: number): void {
    const key = String(status);
    this.requestStats.statusCodes[key] = (this.requestStats.statusCodes[key] ?? 0) + 1;
  }

  private applyRateLimitCooldown(url: string, retryAfterMs?: number): void {
    const origin = originFor(url);
    const duration = retryAfterMs ?? this.rateLimitCooldownMs;
    const until = Date.now() + duration + jitter(500);
    this.rateLimitUntil.set(origin, Math.max(this.rateLimitUntil.get(origin) ?? 0, until));
    this.requestStats.rateLimitCooldowns += 1;
  }

  private async waitForRateLimitCooldown(url: string, signal?: AbortSignal): Promise<void> {
    const until = this.rateLimitUntil.get(originFor(url)) ?? 0;
    const waitMs = Math.max(0, until - Date.now());
    if (waitMs <= 0) return;
    this.requestStats.rateLimitCooldownWaitMs += waitMs;
    await abortableDelay(waitMs, signal);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isSuccessfulStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

function originFor(url: string): string {
  return new URL(url).origin;
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) return Math.max(0, timestamp - Date.now());
  return undefined;
}

function jitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AbortError(abortReason(signal)));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new AbortError(signal ? abortReason(signal) : new Error('请求已取消')));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function runCurl(
  url: string,
  options: CurlOptions,
): Promise<{ data: Uint8Array; status: number }> {
  const marker = '\n__WENKU8_HTTP_STATUS__:';
  const child = spawn('curl', ['--config', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];

  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

  const abort = () => child.kill('SIGTERM');
  options.signal?.addEventListener('abort', abort, { once: true });

  child.stdin.end(curlConfig(url, options, marker));

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  }).finally(() => options.signal?.removeEventListener('abort', abort));

  if (options.signal?.aborted) throw new AbortError(abortReason(options.signal));
  if (exitCode !== 0) {
    const message = Buffer.concat(stderr).toString('utf8').trim() || `curl exited with ${exitCode}`;
    throw new Error(`curl 请求失败：${sanitizeCurlError(message)}`);
  }

  const buffer = Buffer.concat(stdout);
  const markerIndex = buffer.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error('curl 响应缺少 HTTP 状态码');
  const status = Number(
    buffer
      .subarray(markerIndex + marker.length)
      .toString('utf8')
      .trim(),
  );
  if (!Number.isInteger(status)) throw new Error('curl 响应状态码无效');
  return { data: buffer.subarray(0, markerIndex), status };
}

function curlConfig(url: string, options: CurlOptions, marker: string): string {
  const headers = [
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control: no-cache',
    'Pragma: no-cache',
    'Upgrade-Insecure-Requests: 1',
    ...(options.cookie ? [`Cookie: ${options.cookie}`] : []),
  ];
  return [
    'silent',
    'show-error',
    'location',
    'compressed',
    `connect-timeout = "${Math.ceil(options.timeoutMs / 1000)}"`,
    `max-time = "${Math.ceil(options.timeoutMs / 1000)}"`,
    `url = "${escapeCurlConfig(url)}"`,
    `user-agent = "${escapeCurlConfig(options.userAgent)}"`,
    ...headers.map((header) => `header = "${escapeCurlConfig(header)}"`),
    `write-out = "${escapeCurlConfig(`${marker}%{http_code}`)}"`,
    '',
  ].join('\n');
}

interface CurlOptions {
  timeoutMs: number;
  cookie?: string;
  userAgent: string;
  signal?: AbortSignal;
}

function escapeCurlConfig(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function sanitizeCurlError(message: string): string {
  return message.replace(/Cookie:[^\n\r]*/gi, 'Cookie: [redacted]');
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('请求已取消');
}
