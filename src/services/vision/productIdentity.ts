/**
 * 从包装正面的 OCR 结果提取商品身份（产品需求 §24 / §23）
 *
 * 明确不做的事：**不是只 OCR 就完事**。
 * §24 要求至少提取 brand / product_name / variant / flavor / quantity /
 * category / visible_text / barcode，然后拼成搜索词去查商品。
 *
 * 这些是**启发式规则**，不保证次次都对。所以：
 * - 提取结果只用于生成搜索候选，绝不直接当事实写库；
 * - 最终必须由用户确认（§25）。
 *
 * 全部是纯函数，可以用真实 OCR 文本做单元测试。
 */

import { normalizeBarcode } from '@/domain/barcode';
import type { OcrBlock } from '../../../modules/hukang-vision';
import type { ProductIdentityExtraction } from './types';

export interface OcrLineInput {
  text: string;
  /** 行高相对整张图片高度的比例，用于判断字号大小 */
  relativeHeight: number;
  /** 行在图片中的垂直位置比例 0..1，用于判断上下顺序 */
  relativeTop: number;
}

/** 把带位置信息的 OCR 块拍平成按从上到下、字号从大到小可排序的行 */
export function flattenOcrLines(blocks: OcrBlock[], imageHeight: number): OcrLineInput[] {
  const height = imageHeight > 0 ? imageHeight : 1;
  const lines: OcrLineInput[] = [];

  for (const block of blocks ?? []) {
    for (const line of block.lines ?? []) {
      const text = (line.text ?? '').trim();
      if (!text) continue;
      const box = line.boundingBox;
      lines.push({
        text,
        relativeHeight: box ? Math.abs(box.bottom - box.top) / height : 0,
        relativeTop: box ? box.top / height : 0.5,
      });
    }
  }

  return lines.sort((a, b) => a.relativeTop - b.relativeTop);
}

const UNIT_PATTERN = '(kg|KG|Kg|g|G|克|千克|毫升|ml|mL|ML|L|升)';

/**
 * 单位写法归一。
 *
 * 包装上的写法非常杂：500ml / 500ML / 500毫升 都是同一个规格。
 * 归一后搜索关键词才稳定，缓存也才能命中。
 */
const UNIT_NORMALIZE: Record<string, string> = {
  g: 'g',
  G: 'g',
  克: 'g',
  kg: 'kg',
  KG: 'kg',
  Kg: 'kg',
  千克: 'kg',
  ml: 'mL',
  mL: 'mL',
  ML: 'mL',
  毫升: 'mL',
  l: 'L',
  L: 'L',
  升: 'L',
};

/** 把 “500ml” / “1.5 L” / “100克” 归一成 “500mL” / “1.5L” / “100g” */
export function normalizeQuantity(raw: string): string | null {
  const match = /^(\d+(?:\.\d+)?)\s*(.+)$/.exec(raw.trim());
  if (!match) return null;
  const unit = UNIT_NORMALIZE[match[2].trim()];
  if (!unit) return null;
  return `${match[1]}${unit}`;
}

/** 规格/净含量：包装上一定会有，是最可靠的字段之一 */
export function extractQuantity(text: string): string | null {
  const patterns = [
    new RegExp(`净含量\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?\\s*${UNIT_PATTERN})`),
    new RegExp(`规格\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?\\s*${UNIT_PATTERN})`),
    new RegExp(`(?:^|[^\\d.])(\\d+(?:\\.\\d+)?\\s*${UNIT_PATTERN})(?![\\d])`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const normalized = normalizeQuantity(match[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

const FLAVOR_KEYWORDS = ['口味', '风味', '味'];

export function extractFlavor(lines: OcrLineInput[]): string | null {
  for (const line of lines) {
    for (const keyword of FLAVOR_KEYWORDS) {
      const index = line.text.indexOf(keyword);
      if (index > 0) {
        // 取关键词前面的词作为口味名，例如 “乌龙茶味” → “乌龙茶”
        const head = line.text.slice(0, index).replace(/[（(【\[].*$/, '').trim();
        const candidate = head.split(/[\s,，、·]+/).pop() ?? '';
        if (candidate.length >= 2 && candidate.length <= 8) return candidate;
      }
    }
  }
  return null;
}

const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  { category: '饮料', keywords: ['饮料', '果汁', '汽水', '可乐', '矿泉水', '咖啡', '茶饮料', '苏打水'] },
  { category: '乳制品', keywords: ['牛奶', '酸奶', '乳饮料', '纯奶', '舒化奶', '乳制品'] },
  { category: '休闲零食', keywords: ['薯片', '饼干', '膨化', '坚果', '辣条', '肉干', '果冻'] },
  { category: '方便食品', keywords: ['方便面', '泡面', '速食', '自热', '米线', '粉丝'] },
  { category: '烘焙', keywords: ['面包', '蛋糕', '吐司', '糕点', '欧包'] },
  { category: '调味品', keywords: ['酱油', '食醋', '蚝油', '味精', '鸡精', '调味料'] },
  { category: '冷冻食品', keywords: ['速冻', '冷冻', '冰淇淋', '雪糕'] },
  { category: '糖果', keywords: ['糖果', '巧克力', '口香糖'] },
];

export function guessCategory(text: string): string | null {
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((k) => text.includes(k))) return entry.category;
  }
  return null;
}

/** 从整段文字里找校验位合法的条形码（照片里同时出现条码时一并利用，§23） */
export function findBarcodeInText(text: string): string | null {
  const candidates = text.match(/\d{8,14}/g) ?? [];
  for (const candidate of candidates) {
    const normalized = normalizeBarcode(candidate);
    if (normalized.valid) return normalized.digits;
  }
  return null;
}

/** 像是品牌名：短、无数字、无标点、通常带“牌”或在最上方 */
function looksLikeBrand(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 8) return false;
  if (/\d/.test(trimmed)) return false;
  if (/[，。、：:；;！!？?（）()【】\[\]]/.test(trimmed)) return false;
  return true;
}

export interface ExtractOptions {
  /** 已知的品牌名（例如从条形码查到过），命中即优先采用 */
  knownBrand?: string | null;
}

export function extractProductIdentity(
  rawText: string,
  lines: OcrLineInput[],
  options: ExtractOptions = {},
): ProductIdentityExtraction {
  const usableLines = lines.filter((l) => l.text.trim().length > 0);
  const barcode = findBarcodeInText(rawText);
  const quantity = extractQuantity(rawText);
  const flavor = extractFlavor(usableLines);
  const category = guessCategory(rawText);

  // 品牌：优先使用已知品牌；否则取最靠上、符合品牌特征的一行
  let brand: string | null = null;
  if (options.knownBrand && rawText.includes(options.knownBrand)) {
    brand = options.knownBrand;
  } else {
    const topLines = usableLines.filter((l) => l.relativeTop < 0.45);
    brand = topLines.find((l) => looksLikeBrand(l.text))?.text.trim() ?? null;
  }

  // 商品名：字号最大的那一行（包装正面最大的字通常是商品名），
  // 若该行等于品牌则顺延到下一个候选
  const bySize = [...usableLines].sort((a, b) => b.relativeHeight - a.relativeHeight);
  const nameCandidate =
    bySize.find((l) => looksLikeBrand(l.text) || l.text.length <= 20)?.text.trim() ?? null;
  const productName = nameCandidate && nameCandidate !== brand ? nameCandidate : null;

  // 规格行本身不是商品名
  const quantityLine = quantity ? usableLines.find((l) => l.text.includes(quantity)) : undefined;
  const finalName =
    productName && quantityLine && productName === quantityLine.text.trim() ? null : productName;

  return {
    brand,
    productName: finalName,
    variant: null,
    flavor,
    quantity,
    category,
    visibleText: rawText,
    barcode,
  };
}

/**
 * 拼搜索关键词（§24 的例子：“农夫山泉 东方树叶 乌龙茶 500mL”）。
 * 只放确实提取到的部分，不用占位词凑数。
 */
export function buildSearchKeyword(identity: ProductIdentityExtraction): string {
  const parts = [identity.brand, identity.productName, identity.flavor, identity.quantity].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  );
  // 去掉重复项（品牌与商品名偶尔会重复）
  return Array.from(new Set(parts)).join(' ').trim();
}
