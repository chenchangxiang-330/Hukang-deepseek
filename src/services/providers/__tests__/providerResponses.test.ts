/**
 * Provider 响应映射的确定性单元测试（离线，mock 网络层）
 *
 * 为什么需要这一组：真实接口会限流、会有垃圾数据，
 * 用真实请求去断言“这个码一定查不到”是不可靠的
 * （实测发现 9999999999994 竟然真的被 Open Food Facts 收录了）。
 *
 * 所以“缺失 / 限流 / 网络故障”如何映射成结果状态，必须在这里用
 * 真实抓到的响应形状确定性地验证 —— 这正是最容易写错、
 * 也最容易误导用户的地方（§43 禁止把不同失败合并成一句话）。
 */

jest.mock('@/services/network/http', () => ({
  fetchJson: jest.fn(),
}));

import { HuKangError } from '@/domain/errors';
import { fetchJson } from '@/services/network/http';
import { openFoodFactsV2 } from '../openFoodFacts';

const mockedFetchJson = fetchJson as jest.MockedFunction<typeof fetchJson>;

function ok<T>(data: T) {
  return { status: 200, ok: true, data };
}

beforeEach(() => {
  mockedFetchJson.mockReset();
});

describe('Open Food Facts 响应 → 结果状态', () => {
  it('status:0 表示库里没有这个码 → no_match', async () => {
    // 这是 OFF 表示“未收录”的真实形状
    mockedFetchJson.mockResolvedValue(ok({ status: 0, code: '9999999999999' }));
    const outcome = await openFoodFactsV2.lookupByBarcode('9999999999999');
    expect(outcome.kind).toBe('no_match');
  });

  it('HTTP 404 → no_match（商品不存在，不是网络故障）', async () => {
    mockedFetchJson.mockResolvedValue({ status: 404, ok: false, data: null });
    const outcome = await openFoodFactsV2.lookupByBarcode('9999999999999');
    expect(outcome.kind).toBe('no_match');
  });

  it('HTTP 503（限流）→ unavailable，绝不能变成 no_match', async () => {
    // 实测 OFF 会返回 503 限流。若把它当成 no_match，
    // 用户会以为商品不存在，这是严重的误导。
    mockedFetchJson.mockResolvedValue({ status: 503, ok: false, data: null });
    const outcome = await openFoodFactsV2.lookupByBarcode('5449000000996');
    expect(outcome.kind).toBe('unavailable');
  });

  it('传输失败（超时/断网）→ unavailable，且 Provider 不抛异常', async () => {
    mockedFetchJson.mockRejectedValue(new HuKangError('NETWORK_ERROR'));
    await expect(openFoodFactsV2.lookupByBarcode('5449000000996')).resolves.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('有记录但没有商品名 → no_match（对用户等于查不到）', async () => {
    mockedFetchJson.mockResolvedValue(ok({ status: 1, product: { code: '123', nutriments: {} } }));
    const outcome = await openFoodFactsV2.lookupByBarcode('123');
    expect(outcome.kind).toBe('no_match');
  });

  it('正常商品 → candidates，并带上来源标识', async () => {
    mockedFetchJson.mockResolvedValue(
      ok({
        status: 1,
        product: {
          code: '5449000000996',
          product_name: 'Coca-Cola',
          brands: 'Coca-Cola',
          nutrition_data_per: '100g',
          nutriments: { 'energy-kcal_100g': 42, sugars_100g: 10.6 },
        },
      }),
    );
    const outcome = await openFoodFactsV2.lookupByBarcode('5449000000996');
    expect(outcome.kind).toBe('candidates');
    if (outcome.kind === 'candidates') {
      expect(outcome.source).toBe('openfoodfacts_v2');
      expect(outcome.candidates[0].name).toBe('Coca-Cola');
      expect(outcome.candidates[0].added_sugar_g).toBeNull();
    }
  });
});
