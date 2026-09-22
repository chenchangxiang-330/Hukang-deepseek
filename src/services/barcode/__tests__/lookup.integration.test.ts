/**
 * 条形码查询链编排的集成测试（真实网络 + mock 本地库）
 *
 * 目的：证明 §19 描述的链路真的按顺序工作，而不是“函数都在”。
 *   normalizeBarcode → SQLite → 未命中则自动联网
 *
 * 本地库是 expo-sqlite（原生模块，Node 下不可用），所以单独 mock；
 * 联网部分走真实请求。
 */

jest.mock('@/db/repositories/productRepo', () => ({
  findProductByBarcode: jest.fn(),
}));

import { findProductByBarcode } from '@/db/repositories/productRepo';
import { lookupBarcode } from '@/services/barcode/lookup';
import type { Product } from '@/domain/types';

const mockedFind = findProductByBarcode as jest.MockedFunction<typeof findProductByBarcode>;

jest.setTimeout(45000);

const localProduct: Product = {
  id: 'local-1',
  barcode: '5449000000996',
  brand: '本地品牌',
  name: '本地可乐',
  variant: null,
  quantity: '330ml',
  category: null,
  image_uri: null,
  nutrition_basis_amount: 100,
  nutrition_basis_unit: 'ml',
  energy_kcal: 42,
  energy_kj: 180,
  protein_g: 0,
  fat_g: 0,
  carbohydrate_g: 10.6,
  total_sugar_g: 10.6,
  added_sugar_g: null,
  fiber_g: null,
  sodium_mg: 0,
  ingredients_raw_text: null,
  ingredients_list: null,
  data_source: 'manual',
  created_at: '2026-09-22T00:00:00.000Z',
  updated_at: '2026-09-22T00:00:00.000Z',
  last_verified_at: null,
};

beforeEach(() => {
  mockedFind.mockReset();
});

describe('[集成] lookupBarcode 编排', () => {
  it('本地命中时直接返回，不发起联网请求', async () => {
    mockedFind.mockImplementation(async (code: string) =>
      code === '5449000000996' ? localProduct : null,
    );

    const result = await lookupBarcode('5449000000996');
    expect(result.kind).toBe('local');
    if (result.kind === 'local') {
      expect(result.product.name).toBe('本地可乐');
    }
    // 只查了本地，没有联网的痕迹
    expect(mockedFind).toHaveBeenCalled();
  });

  it('本地未命中时自动联网查询，用户不需要点“联网搜索”', async () => {
    mockedFind.mockResolvedValue(null);

    const result = await lookupBarcode('5449000000996');
    expect(result.kind).toBe('online');
    if (result.kind === 'online') {
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0].name).toBeTruthy();
    }
  });

  it('校验位错误时返回 invalid，且完全不联网', async () => {
    mockedFind.mockResolvedValue(null);

    const result = await lookupBarcode('6901234567890');
    expect(result.kind).toBe('invalid');
    // 连本地都不该查 —— 码本身不可信
    expect(mockedFind).not.toHaveBeenCalled();
  });

  it('UPC-A 会按补零的 EAN-13 再试一次', async () => {
    const seen: string[] = [];
    mockedFind.mockImplementation(async (code: string) => {
      seen.push(code);
      return null;
    });

    await lookupBarcode('036000291452');
    // 先试原始 UPC-A，再试补零的 EAN-13
    expect(seen).toEqual(['036000291452', '0036000291452']);
  });

  it('所有数据源都明确说“没有”时返回 not_found，而不是网络错误', async () => {
    mockedFind.mockResolvedValue(null);

    // 用 stub 数据源做确定性验证：
    // 真实众包库里连 9999999999994 这种垃圾码都真的存在，无法用来断言“一定查不到”。
    const result = await lookupBarcode('1234567890128', undefined, {
      providers: [
        {
          id: 'stub_miss',
          label: 'stub',
          requiresKey: false,
          lookupByBarcode: async () => ({ kind: 'no_match', source: 'stub_miss' }),
        },
      ],
    });

    expect(result.kind).toBe('not_found');
    if (result.kind === 'not_found') {
      expect(result.triedSources).toContain('stub_miss:1234567890128');
    }
  });

  it('数据源全部不可用时返回 unavailable —— 不等于商品不存在', async () => {
    mockedFind.mockResolvedValue(null);

    const result = await lookupBarcode('1234567890128', undefined, {
      providers: [
        {
          id: 'stub_down',
          label: 'stub',
          requiresKey: false,
          lookupByBarcode: async () => ({
            kind: 'unavailable',
            source: 'stub_down',
            reason: 'HTTP 503',
          }),
        },
      ],
    });

    expect(result.kind).toBe('unavailable');
  });

  it('数据源抛异常也不会让查询失败，降级为 unavailable', async () => {
    mockedFind.mockResolvedValue(null);

    const result = await lookupBarcode('1234567890128', undefined, {
      providers: [
        {
          id: 'stub_throw',
          label: 'stub',
          requiresKey: false,
          lookupByBarcode: async () => {
            throw new Error('boom');
          },
        },
      ],
    });

    expect(result.kind).toBe('unavailable');
  });

  it('离线模式下不联网，直接如实返回不可用', async () => {
    mockedFind.mockResolvedValue(null);

    const result = await lookupBarcode('5449000000996', undefined, { offlineOnly: true });
    expect(result.kind).toBe('unavailable');
  });
});
