/**
 * Provider 通用工具。
 *
 * 契约：Provider **永远不抛异常**。
 * 网络故障要翻译成 `{ kind: 'unavailable' }`，因为“数据源暂时不可用”
 * 和“商品不存在”对用户是完全不同的两件事（§43）。
 * 让异常穿透到编排层，早晚会有人把它误当成“没查到”。
 */

import { HuKangError } from '@/domain/errors';
import type { LookupOutcome } from './types';

export function unavailable(source: string, error: unknown): LookupOutcome {
  let reason: string;
  if (error instanceof HuKangError) {
    reason = error.code;
  } else if (error instanceof Error) {
    reason = error.message;
  } else {
    reason = String(error);
  }
  return { kind: 'unavailable', source, reason };
}

/** 把可能抛异常的查询包成永不抛异常的 Outcome */
export async function guardLookup(
  source: string,
  run: () => Promise<LookupOutcome>,
): Promise<LookupOutcome> {
  try {
    return await run();
  } catch (error) {
    return unavailable(source, error);
  }
}
