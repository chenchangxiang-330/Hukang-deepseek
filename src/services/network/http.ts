/**
 * 联网基础层。
 *
 * 设计要点（§42：错误必须分类）：
 * - 传输失败 / 超时 → NETWORK_ERROR（可重试）
 * - HTTP 4xx/5xx        → 不抛异常，把 status 交给调用方判断
 *   （因为对商品数据库来说 404 表示“这个码没收录”，不是网络故障，
 *     两者对用户的含义完全不同）
 */

import { HuKangError } from '@/domain/errors';

export interface HttpResult<T> {
  status: number;
  ok: boolean;
  data: T | null;
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 12000;

/** Open Food Facts 要求带可识别的 User-Agent，否则可能被限流 */
export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': 'HuKang-DeepSeek/1.0 (Android; personal food tracker)',
};

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<HttpResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...DEFAULT_HEADERS, ...headers },
      signal: controller.signal,
    });

    let data: T | null = null;
    try {
      data = (await response.json()) as T;
    } catch {
      // 有些错误响应不是 JSON，保持 data 为 null，由调用方按 status 处理
      data = null;
    }

    return { status: response.status, ok: response.ok, data };
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError';
    throw new HuKangError('NETWORK_ERROR', {
      technical: {
        message: aborted ? `请求超时（${timeoutMs}ms）` : '网络请求失败',
        extra: { url, error: String(error) },
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
