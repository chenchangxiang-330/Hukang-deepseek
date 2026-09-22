/**
 * 条形码归一化与校验（产品需求 §19 / §20）
 *
 * 关键认识：普通商品条形码**只是商品标识符**，本身不含营养数据、配料、
 * 生产日期或保质期。所以这里是纯粹的“把码变成可靠的查询键”，
 * 真正的商品信息必须去数据库查（§20）。
 *
 * 支持 EAN-13 / EAN-8 / UPC-A / UPC-E（§19），并统一产出可用于查询的形式。
 * 所有校验位都按 GTIN 标准实算，不做“看起来像就放过”。
 */

export type BarcodeFormat = 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'GTIN14' | 'UNKNOWN';

export interface NormalizedBarcode {
  /** 原始输入，保留用于 Developer Mode 排查 */
  raw: string;
  /** 只保留数字后的结果 */
  digits: string;
  format: BarcodeFormat;
  /** 校验位是否正确 */
  valid: boolean;
  /** 校验失败原因（仅技术用途） */
  reason?: string;
  /**
   * 按优先级排列的查询键。
   *
   * 同一个商品在不同数据库里可能以 UPC-A（12 位）或 EAN-13（13 位，前面补 0）
   * 存储，所以两个形式都要试，而不是只试一种就断言“查不到”。
   */
  lookupKeys: string[];
  /** EAN-13 形式；无法转换时为 null */
  ean13: string | null;
}

/** GTIN 标准校验位：从右往左交替乘 3 和 1 */
export function computeCheckDigit(payload: string): number {
  let sum = 0;
  for (let i = 0; i < payload.length; i += 1) {
    const digit = Number(payload[payload.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(digits: string): boolean {
  if (!/^\d+$/.test(digits) || digits.length < 2) return false;
  const payload = digits.slice(0, -1);
  const check = Number(digits.slice(-1));
  return computeCheckDigit(payload) === check;
}

/**
 * UPC-E → UPC-A 展开。
 *
 * UPC-E 是被压缩过的 12 位 UPC-A：最后一位数据位决定补零的位置。
 * 展开后才能用标准校验位验证，也才能拿去查询。
 */
export function expandUpceToUpca(upce: string): string | null {
  if (!/^\d{8}$/.test(upce)) return null;

  const numberSystem = upce[0];
  if (numberSystem !== '0' && numberSystem !== '1') return null;

  const d = upce.slice(1, 7); // 6 位数据
  const check = upce[7];
  const last = d[5];

  let middle: string;
  if (last === '0' || last === '1' || last === '2') {
    // 0 1 2 → 第 3 位后插入 0000，制造商标识取 d[0..1]，商品标识取 d[2]
    middle = `${d[0]}${d[1]}${last}0000${d[2]}${d[3]}${d[4]}`;
  } else if (last === '3') {
    middle = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  } else if (last === '4') {
    middle = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  } else {
    middle = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${last}`;
  }

  if (middle.length !== 10) return null;
  return `${numberSystem}${middle}${check}`;
}

/**
 * 扫描器给出的类型提示 → 我们的格式。
 * expo-camera 返回的是 'ean13' | 'ean8' | 'upc_a' | 'upc_e' 这类小写值。
 */
function formatFromHint(hint: string | undefined, digits: string): BarcodeFormat | null {
  if (!hint) return null;
  const key = hint.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'ean13' || key === 'ean_13') return 'EAN13';
  if (key === 'ean8' || key === 'ean_8') return 'EAN8';
  if (key === 'upca' || key === 'upc_a') return 'UPCA';
  if (key === 'upce' || key === 'upc_e') return 'UPCE';
  if (key === 'gtin14' || key === 'itf14') return digits.length === 14 ? 'GTIN14' : null;
  return null;
}

/** 按长度推断格式；8 位无法区分 EAN-8 与 UPC-E，两者都试 */
function formatFromLength(digits: string): BarcodeFormat {
  switch (digits.length) {
    case 8:
      return 'EAN8';
    case 12:
      return 'UPCA';
    case 13:
      return 'EAN13';
    case 14:
      return 'GTIN14';
    default:
      return 'UNKNOWN';
  }
}

/**
 * 归一化入口。
 *
 * @param raw 扫描或输入得到的原始字符串
 * @param hint 扫描器给出的类型（可选），用于区分同为 8 位的 EAN-8 与 UPC-E
 */
export function normalizeBarcode(raw: string, hint?: string): NormalizedBarcode {
  const digits = (raw ?? '').replace(/\D/g, '');

  if (digits.length === 0) {
    return {
      raw: raw ?? '',
      digits: '',
      format: 'UNKNOWN',
      valid: false,
      reason: '没有数字',
      lookupKeys: [],
      ean13: null,
    };
  }

  // UPC-E：扫描器明示，或 8 位且以 0/1 开头且能成功展开
  const hintedFormat = formatFromHint(hint, digits);
  const upceCandidate =
    hintedFormat === 'UPCE' || (digits.length === 8 && /^[01]/.test(digits));

  if (upceCandidate) {
    const upca = expandUpceToUpca(digits);
    if (upca) {
      const valid = isValidGtin(upca);
      const ean13 = `0${upca}`;
      return {
        raw,
        digits,
        format: 'UPCE',
        valid,
        reason: valid ? undefined : 'UPC-E 展开后校验位不匹配',
        // UPC-E 必须先展开成 UPC-A / EAN-13 才能查库
        lookupKeys: [ean13, upca, digits],
        ean13,
      };
    }
    if (hintedFormat === 'UPCE') {
      return {
        raw,
        digits,
        format: 'UPCE',
        valid: false,
        reason: 'UPC-E 无法展开为 UPC-A',
        lookupKeys: [digits],
        ean13: null,
      };
    }
  }

  const format = hintedFormat ?? formatFromLength(digits);
  const valid = isValidGtin(digits);

  let ean13: string | null = null;
  const lookupKeys: string[] = [];

  if (format === 'EAN13') {
    ean13 = digits;
    lookupKeys.push(digits);
  } else if (format === 'UPCA' || digits.length === 12) {
    ean13 = `0${digits}`;
    // 先按原始 UPC-A 查，再按补零的 EAN-13 查
    lookupKeys.push(digits, ean13);
  } else if (format === 'EAN8' || digits.length === 8) {
    lookupKeys.push(digits);
  } else if (format === 'GTIN14' || digits.length === 14) {
    // GTIN-14 常以 0 开头包裹 EAN-13
    const stripped = digits.replace(/^0+/, '');
    lookupKeys.push(digits);
    if (stripped.length === 13) {
      ean13 = stripped;
      lookupKeys.push(stripped);
    }
  } else {
    lookupKeys.push(digits);
  }

  return {
    raw,
    digits,
    format,
    valid,
    reason: valid ? undefined : '校验位不匹配',
    // 去重，保持优先级
    lookupKeys: Array.from(new Set(lookupKeys.filter(Boolean))),
    ean13,
  };
}

/** 扫描器类型白名单：正是 §19 要求的四种 */
export const SUPPORTED_BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
