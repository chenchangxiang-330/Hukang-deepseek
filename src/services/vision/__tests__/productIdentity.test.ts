/**
 * 商品身份提取的单元测试（离线，用真实包装上会出现的文字）
 *
 * 这些规则是启发式的，所以更需要测试把行为钉住：
 * 改规则时能立刻看出有没有把原来的场景弄坏。
 */

import {
  buildSearchKeyword,
  extractProductIdentity,
  extractQuantity,
  findBarcodeInText,
  flattenOcrLines,
  guessCategory,
  normalizeQuantity,
  type OcrLineInput,
} from '../productIdentity';
import type { OcrBlock } from '../../../../modules/hukang-vision';

/** 构造一个“包装正面”的 OCR 行布局 */
function lines(...entries: [string, number, number][]): OcrLineInput[] {
  return entries.map(([text, relativeHeight, relativeTop]) => ({
    text,
    relativeHeight,
    relativeTop,
  }));
}

describe('extractQuantity —— 规格/净含量', () => {
  it('净含量：500ml', () => {
    expect(extractQuantity('净含量：500ml')).toBe('500mL');
  });

  it('净含量 205g（无冒号）', () => {
    expect(extractQuantity('净含量 205g')).toBe('205g');
  });

  it('规格：1.5L', () => {
    expect(extractQuantity('规格：1.5L')).toBe('1.5L');
  });

  it('中文单位归一化', () => {
    expect(extractQuantity('净含量：250毫升')).toBe('250mL');
    expect(extractQuantity('净含量：100克')).toBe('100g');
  });

  it('拉丁单位大小写归一化（包装上 500ml / 500ML 都常见）', () => {
    expect(normalizeQuantity('500ml')).toBe('500mL');
    expect(normalizeQuantity('500ML')).toBe('500mL');
    expect(normalizeQuantity('1.5 L')).toBe('1.5L');
    expect(normalizeQuantity('1000G')).toBe('1000g');
    expect(normalizeQuantity('2KG')).toBe('2kg');
  });

  it('无法识别的单位返回 null，不乱改', () => {
    expect(normalizeQuantity('500粒')).toBeNull();
  });

  it('没有规格时返回 null，不硬凑', () => {
    expect(extractQuantity('农夫山泉 东方树叶')).toBeNull();
  });
});

describe('findBarcodeInText —— 照片里同时有條码时一并利用', () => {
  it('识别出校验位合法的 13 位条码', () => {
    expect(findBarcodeInText('6901234567892')).toBe('6901234567892');
  });

  it('忽略校验位不合法的数字串', () => {
    expect(findBarcodeInText('6901234567890')).toBeNull();
  });

  it('从混杂文本里挑出合法条码', () => {
    expect(findBarcodeInText('条码 6901234567892 净含量 500ml')).toBe('6901234567892');
  });
});

describe('guessCategory —— 品类猜测', () => {
  it('茶饮料 → 饮料', () => {
    expect(guessCategory('东方树叶 乌龙茶 饮料')).toBe('饮料');
  });

  it('酸奶 → 乳制品', () => {
    expect(guessCategory('安慕希 希腊风味酸奶')).toBe('乳制品');
  });

  it('薯片 → 休闲零食', () => {
    expect(guessCategory('乐事 薯片')).toBe('休闲零食');
  });

  it('猜不出时返回 null', () => {
    expect(guessCategory('康康')).toBeNull();
  });
});

describe('extractProductIdentity —— 包装正面整体提取', () => {
  it('农夫山泉 东方树叶 乌龙茶 500ml（包装上写了茶饮料）', () => {
    const ocr = lines(
      ['农夫山泉', 0.06, 0.1],
      ['东方树叶', 0.12, 0.3],
      ['乌龙茶', 0.08, 0.45],
      ['茶饮料', 0.05, 0.55],
      ['净含量：500ml', 0.03, 0.8],
    );
    const identity = extractProductIdentity(
      '农夫山泉 东方树叶 乌龙茶 茶饮料 净含量：500ml',
      ocr,
    );

    expect(identity.brand).toBe('农夫山泉');
    // 字号最大的“东方树叶”应被判为商品名
    expect(identity.productName).toBe('东方树叶');
    expect(identity.quantity).toBe('500mL');
    expect(identity.category).toBe('饮料');
    expect(buildSearchKeyword(identity)).toBe('农夫山泉 东方树叶 500mL');
  });

  it('包装上没写品类时留空，不硬猜（“乌龙茶”可能是茶叶也可能是茶饮料）', () => {
    const identity = extractProductIdentity('农夫山泉 东方树叶 乌龙茶 净含量：500ml', []);
    expect(identity.category).toBeNull();
  });

  it('伊利 安慕希 希腊风味酸奶 205g（含口味）', () => {
    const ocr = lines(
      ['伊利', 0.05, 0.08],
      ['安慕希', 0.13, 0.28],
      ['希腊风味酸奶', 0.07, 0.44],
      ['净含量：205g', 0.03, 0.82],
    );
    const identity = extractProductIdentity(
      '伊利 安慕希 希腊风味酸奶 净含量：205g',
      ocr,
    );

    expect(identity.brand).toBe('伊利');
    expect(identity.productName).toBe('安慕希');
    expect(identity.flavor).toBe('希腊');
    expect(identity.quantity).toBe('205g');
    expect(identity.category).toBe('乳制品');
  });

  it('照片里同时有合法条码时会被提取出来', () => {
    const ocr = lines(['乐事', 0.06, 0.1], ['薯片', 0.12, 0.3], ['黄瓜味', 0.07, 0.5]);
    const identity = extractProductIdentity('乐事 薯片 黄瓜味 6901234567892', ocr);

    expect(identity.barcode).toBe('6901234567892');
    expect(identity.flavor).toBe('黄瓜');
    expect(identity.category).toBe('休闲零食');
  });

  it('已知品牌优先于猜测', () => {
    const ocr = lines(['某某', 0.06, 0.1], ['苏打水', 0.12, 0.3]);
    const identity = extractProductIdentity('某某 苏打水 农夫山泉', ocr, {
      knownBrand: '农夫山泉',
    });
    expect(identity.brand).toBe('农夫山泉');
  });

  it('提取不到就是 null，不编造', () => {
    const identity = extractProductIdentity('', []);
    expect(identity.brand).toBeNull();
    expect(identity.productName).toBeNull();
    expect(identity.quantity).toBeNull();
    expect(identity.barcode).toBeNull();
    expect(identity.visibleText).toBe('');
  });

  it('visibleText 保留 OCR 原文，便于用户核对与开发者排查', () => {
    const raw = '伊利 安慕希 净含量：205g';
    const identity = extractProductIdentity(raw, lines(['伊利', 0.05, 0.1]));
    expect(identity.visibleText).toBe(raw);
  });
});

describe('flattenOcrLines —— 位置信息拍平', () => {
  it('按从上到下排序，并计算相对行高', () => {
    const blocks: OcrBlock[] = [
      {
        text: 'B',
        boundingBox: { left: 0, top: 400, right: 100, bottom: 450 },
        lines: [
          {
            text: '下面',
            boundingBox: { left: 0, top: 400, right: 100, bottom: 450 },
            elements: [],
          },
        ],
      },
      {
        text: 'A',
        boundingBox: { left: 0, top: 100, right: 100, bottom: 160 },
        lines: [
          {
            text: '上面',
            boundingBox: { left: 0, top: 100, right: 100, bottom: 160 },
            elements: [],
          },
        ],
      },
    ];

    const flat = flattenOcrLines(blocks, 1000);
    expect(flat.map((l) => l.text)).toEqual(['上面', '下面']);
    expect(flat[0].relativeTop).toBeCloseTo(0.1, 5);
    expect(flat[0].relativeHeight).toBeCloseTo(0.06, 5);
  });

  it('没有位置信息时不崩溃', () => {
    const flat = flattenOcrLines(
      [{ text: 'x', boundingBox: null, lines: [{ text: '无框', boundingBox: null, elements: [] }] }],
      0,
    );
    expect(flat).toHaveLength(1);
    expect(flat[0].relativeHeight).toBe(0);
  });
});

describe('buildSearchKeyword', () => {
  it('只拼确实提取到的部分，不用占位词凑数', () => {
    expect(
      buildSearchKeyword({
        brand: '乐事',
        productName: '薯片',
        variant: null,
        flavor: null,
        quantity: null,
        category: null,
        visibleText: '',
        barcode: null,
      }),
    ).toBe('乐事 薯片');
  });

  it('去重', () => {
    expect(
      buildSearchKeyword({
        brand: '农夫山泉',
        productName: '农夫山泉',
        variant: null,
        flavor: null,
        quantity: '500mL',
        category: null,
        visibleText: '',
        barcode: null,
      }),
    ).toBe('农夫山泉 500mL');
  });
});
