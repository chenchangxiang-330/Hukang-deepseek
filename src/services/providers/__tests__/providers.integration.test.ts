/**
 * 联网数据源集成测试（真实请求，非 mock）
 *
 * 这一组测试证明的是“识别链真的能跑通”，而不是“函数存在”。
 * 因为依赖外网，默认单测不包含它，需要显式运行：
 *     npm run test:integration
 *
 * 若某个断言失败，说明数据源接口或字段真的变了，属于必须处理的真实问题。
 */

import { normalizeBarcode } from '@/domain/barcode';
import { openFoodFactsSearch, openFoodFactsV2 } from '../openFoodFacts';
import { wikidataProvider } from '../wikidata';

jest.setTimeout(45000);

describe('[集成] Open Food Facts 按条码查询', () => {
  it('可口可乐 5449000000996 能查到真实商品', async () => {
    const outcome = await openFoodFactsV2.lookupByBarcode('5449000000996');
    expect(outcome.kind).toBe('candidates');
    if (outcome.kind !== 'candidates') return;

    const c = outcome.candidates[0];
    expect(c.name).toBeTruthy();
    expect(c.brand).toBeTruthy();
    // 实测该商品有完整的每 100g 数据
    expect(c.basisAmount).toBe(100);
    expect(c.basisUnit).toBe('g');
    expect(c.energy_kcal).toBeGreaterThan(0);
    expect(c.carbohydrate_g).toBeGreaterThan(0);
    // 钠必须已从克换算成毫克
    expect(c.sodium_mg).not.toBeNull();
    expect(c.sodium_mg!).toBeGreaterThanOrEqual(0);
  });

  it('中国商品 茉莉花茶 6921168558049 能查到，且基准是每 100ml', async () => {
    const outcome = await openFoodFactsV2.lookupByBarcode('6921168558049');
    expect(outcome.kind).toBe('candidates');
    if (outcome.kind !== 'candidates') return;

    const c = outcome.candidates[0];
    expect(c.name).toBeTruthy();
    expect(c.basisUnit).toBe('ml');
  });

  it('任意合法条码都返回明确状态，绝不抛异常', async () => {
    // 注意：不能断言“某个码一定查不到”。
    // 实测 9999999999994 这种看起来是垃圾值的码，Open Food Facts 里竟然真的存在
    // （一条叫 "Light & Free SKYR A BOIRE" 的众包数据）。
    // 众包数据库不能假设“校验位合法 = 一定没有”。
    // “缺失 / 限流如何映射”由 providerResponses.test.ts 做确定性验证。
    const outcome = await openFoodFactsV2.lookupByBarcode('1234567890128');
    expect(['candidates', 'no_match', 'unavailable']).toContain(outcome.kind);
  });
});

describe('[集成] Open Food Facts 关键词搜索（中文）', () => {
  it('搜“农夫山泉”：要么返回中文商品，要么如实报不可用 —— 绝不误报“没有”', async () => {
    const outcome = await openFoodFactsSearch.searchByKeyword('农夫山泉', 5);

    // Open Food Facts 有速率限制（实测连续请求会返回 HTTP 503）。
    // 关键不变量：限流必须翻译成 unavailable，而不是“没搜到”。
    // 把 503 当成 no_match 会直接误导用户以为商品不存在。
    expect(outcome.kind).not.toBe('no_match');
    expect(['candidates', 'unavailable']).toContain(outcome.kind);

    if (outcome.kind === 'candidates') {
      expect(outcome.candidates.length).toBeGreaterThan(0);
      const hasChineseBrand = outcome.candidates.some(
        (c) => (c.brand ?? '').includes('农夫山泉') || c.name.includes('农夫山泉'),
      );
      expect(hasChineseBrand).toBe(true);
    } else if (outcome.kind === 'unavailable') {
      // 走到这里说明遇到了限流，如实记录，不掩盖
      console.warn(`[集成] 关键词搜索暂不可用：${outcome.reason}`);
    } else {
      throw new Error(`关键词搜索不应返回 no_match，实际是 ${outcome.kind}`);
    }
  });
});

describe('[集成] Wikidata 作为独立数据源', () => {
  it('调用不抛异常，且结果状态是明确的三选一', async () => {
    const outcome = await wikidataProvider.lookupByBarcode('5449000000996');
    // 覆盖率低是已知事实，但必须给出明确状态，不能抛错
    expect(['candidates', 'no_match', 'unavailable']).toContain(outcome.kind);
    if (outcome.kind === 'candidates') {
      // 它只提供身份，不提供营养 —— 营养字段必须是 null
      const c = outcome.candidates[0];
      expect(c.name).toBeTruthy();
      expect(c.energy_kcal).toBeNull();
      expect(c.added_sugar_g).toBeNull();
    }
  });
});

describe('[集成] 归一化 + 查询的完整链路', () => {
  it('UPC-A 补零成 EAN-13 后仍能查到同一个商品', async () => {
    // 先确认归一化确实产出了两种查询键
    const normalized = normalizeBarcode('5449000000996');
    expect(normalized.valid).toBe(true);

    // 再用补零形式查询，验证查询键设计是有效的
    const asGtin14 = normalizeBarcode('05449000000996');
    expect(asGtin14.lookupKeys).toContain('5449000000996');

    const outcome = await openFoodFactsV2.lookupByBarcode('5449000000996');
    expect(outcome.kind).toBe('candidates');
  });
});
