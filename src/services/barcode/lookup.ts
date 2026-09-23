/**
 * 条形码查询编排（产品需求 §19 / §21 / §22 / §43）
 *
 * 扫描逻辑（§19）：
 *   Camera → Barcode → normalizeBarcode() → SQLite
 *     ├ 本地命中 → 直接显示商品
 *     └ 本地没有 → 自动联网查询（用户不需要点“联网搜索”）
 *
 * 结果状态必须分开（§43）：校验失败 ≠ 查不到 ≠ 网络故障。
 * 三者对用户的含义完全不同，绝不能合并成一句“不认识这款食品”。
 *
 * ── 真机实测后补的两条 ──────────────────────────────
 * 1. **联网必须有总时间预算**：三个数据源各 12 秒超时，串起来最坏要等 30 秒，
 *    用户看到的就是一个一直转圈的页面。现在整段联网最多 8 秒。
 * 2. **要能取消、要能看到进度**：知道"正在查哪个源"比干等好得多。
 */

import { normalizeBarcode, type NormalizedBarcode } from '@/domain/barcode';
import { findProductByBarcode } from '@/db/repositories/productRepo';
import type { Product as ProductModel } from '@/domain/types';
import { OPEN_FOOD_FACTS_PROVIDERS } from '@/services/providers/openFoodFacts';
import { wikidataProvider } from '@/services/providers/wikidata';
import type { BarcodeProvider, ProductCandidate } from '@/services/providers/types';

export type BarcodeLookupResult =
  /** 本地 SQLite 命中，断网也能用 */
  | { kind: 'local'; barcode: NormalizedBarcode; product: ProductModel }
  /** 联网找到候选，需要用户确认后才落库（§22） */
  | {
      kind: 'online';
      barcode: NormalizedBarcode;
      source: string;
      candidates: ProductCandidate[];
    }
  /** 校验位不对：大概率没扫清楚，应该重扫，而不是说“查不到” */
  | { kind: 'invalid'; barcode: NormalizedBarcode }
  /** 所有数据源都明确回答“没有这个码” */
  | { kind: 'not_found'; barcode: NormalizedBarcode; triedSources: string[] }
  /** 数据源都不可用（网络问题 / 超时）—— 不等于商品不存在 */
  | { kind: 'unavailable'; barcode: NormalizedBarcode; triedSources: string[] }
  /** 用户主动取消 */
  | { kind: 'cancelled'; barcode: NormalizedBarcode };

/** 默认数据源顺序：先 Open Food Facts（实测对中文商品也有覆盖），再 Wikidata 作为独立来源 */
export const DEFAULT_BARCODE_PROVIDERS: BarcodeProvider[] = [
  ...OPEN_FOOD_FACTS_PROVIDERS,
  wikidataProvider,
];

/**
 * 整段联网查询的总预算。
 *
 * 8 秒是权衡：公共数据库偶尔要 2～3 秒才应答，但超过 8 秒用户就会觉得卡死。
 * 超时后如实告诉用户"网络不太好"，而不是让他继续等。
 */
export const ONLINE_BUDGET_MS = 8000;

/** 单个数据源分到的超时（预算要够试完主要数据源） */
export const PER_PROVIDER_TIMEOUT_MS = 5000;

export interface LookupProgress {
  /** 正在查询的数据源展示名 */
  label: string;
  /** 已经试了几个 */
  triedCount: number;
  /** 一共大概要试几个 */
  totalCount: number;
}

export interface LookupOptions {
  providers?: BarcodeProvider[];
  /** 跳过联网（离线模式 / 用户关闭联网） */
  offlineOnly?: boolean;
  /** 整段联网的时间预算，默认 ONLINE_BUDGET_MS */
  onlineBudgetMs?: number;
  /**
   * 取消信号。调用方把它设成 true，查询会在下一个检查点尽快返回 cancelled。
   * 用可变对象而不是 AbortSignal：RN 环境里简单可靠。
   */
  cancelSignal?: { cancelled: boolean };
  /** 进度回调，让界面能显示"正在查什么" */
  onProgress?: (progress: LookupProgress) => void;
}

async function findLocal(barcode: NormalizedBarcode): Promise<ProductModel | null> {
  for (const key of barcode.lookupKeys) {
    const hit = await findProductByBarcode(key);
    if (hit) return hit;
  }
  return null;
}

/** 包一层超时：数据源自己不守时的时候，由编排层强制放弃 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function lookupBarcode(
  raw: string,
  hint?: string,
  options: LookupOptions = {},
): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(raw, hint);

  // 空码或校验位错误：先让用户重扫，不要浪费一次联网请求，也不要谎报“查不到”
  if (!barcode.valid || barcode.lookupKeys.length === 0) {
    return { kind: 'invalid', barcode };
  }

  // 第一步：本地
  const local = await findLocal(barcode);
  if (local) {
    return { kind: 'local', barcode, product: local };
  }

  if (options.offlineOnly) {
    return { kind: 'unavailable', barcode, triedSources: [] };
  }

  // 第二步：联网，逐个数据源、逐个查询键
  const providers = options.providers ?? DEFAULT_BARCODE_PROVIDERS;
  const budgetMs = options.onlineBudgetMs ?? ONLINE_BUDGET_MS;
  const startedAt = Date.now();
  const triedSources: string[] = [];
  let sawUnavailable = false;
  let sawDefiniteMiss = false;

  const totalCount = providers.length * barcode.lookupKeys.length;
  let triedCount = 0;

  for (const provider of providers) {
    for (const key of barcode.lookupKeys) {
      if (options.cancelSignal?.cancelled) {
        return { kind: 'cancelled', barcode };
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= budgetMs) {
        // 预算用完：如实归为"网络不好"，不要让用户继续等
        sawUnavailable = true;
        break;
      }

      triedCount += 1;
      options.onProgress?.({
        label: provider.label,
        triedCount,
        totalCount,
      });

      triedSources.push(`${provider.id}:${key}`);
      const remaining = budgetMs - elapsed;

      try {
        const outcome = await withTimeout(
          provider.lookupByBarcode(key, {
            timeoutMs: Math.min(PER_PROVIDER_TIMEOUT_MS, remaining),
          }),
          remaining,
        );

        if (outcome === 'timeout') {
          sawUnavailable = true;
          continue;
        }

        if (outcome.kind === 'candidates' && outcome.candidates.length > 0) {
          return {
            kind: 'online',
            barcode,
            source: outcome.source,
            candidates: outcome.candidates,
          };
        }
        if (outcome.kind === 'unavailable') {
          sawUnavailable = true;
        } else {
          sawDefiniteMiss = true;
        }
      } catch {
        // 单个数据源异常不影响整体流程，继续试下一个
        sawUnavailable = true;
      }
    }
  }

  if (options.cancelSignal?.cancelled) {
    return { kind: 'cancelled', barcode };
  }

  // 只要有一个源明确回答“没有”，就说明确实没收录；
  // 全部不可用才归为网络问题。
  if (sawDefiniteMiss) {
    return { kind: 'not_found', barcode, triedSources };
  }
  if (sawUnavailable) {
    return { kind: 'unavailable', barcode, triedSources };
  }
  return { kind: 'not_found', barcode, triedSources };
}
