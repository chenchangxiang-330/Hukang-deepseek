/**
 * 唯一 ID 生成。
 * 用 expo-crypto 的 randomUUID，避免 Math.random 带来的碰撞风险。
 */

import * as Crypto from 'expo-crypto';

export function newId(): string {
  return Crypto.randomUUID();
}
