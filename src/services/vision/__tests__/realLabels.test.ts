/**
 * 真实包装照片 → 营养解析 的验证（fixture 驱动）
 *
 * fixture 由 tools/mac-ocr/fetch-fixtures.mjs 生成：
 *   Open Food Facts 真实商品照片 → macOS Vision OCR → 真实 OCR 文本
 *
 * 重要边界：macOS Vision ≠ Android ML Kit。
 * 这一组测试验证的是 **Parser 对真实 OCR 文本的处理能力**，
 * 不能替代 Android 端 ML Kit 的真机验证；后者必须标记
 * NOT TESTED ON PHYSICAL DEVICE。
 *
 * fixture 不存在时整组跳过 —— 采集需要访问 Open Food Facts 的图片主机，
 * 在某些网络环境下会被阻断（实测 images.openfoodfacts.org 连接超时）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hasAnyNutritionValue, parseNutritionLabel } from '../nutritionParser';

interface RealLabelFixture {
  code: string;
  productName: string | null;
  brands: string | null;
  source: string;
  ocrLines: string[];
  expected: {
    nutrition_data_per: string | null;
    nutriments: Record<string, number | string | undefined>;
  };
  note: string;
}

const FIXTURE_PATH = join(__dirname, 'fixtures', 'realLabels.json');
const hasFixtures = existsSync(FIXTURE_PATH);

const fixtures: RealLabelFixture[] = hasFixtures
  ? (JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as RealLabelFixture[])
  : [];

const describeIfFixtures = hasFixtures ? describe : describe.skip;

if (!hasFixtures) {
  // 明确说明为什么没跑，避免被误读成“已验证”
  console.warn(
    '[真实照片验证] 未找到 fixtures/realLabels.json，已跳过。' +
      '运行 node tools/mac-ocr/fetch-fixtures.mjs 采集（需要能访问 Open Food Facts 图片主机）。',
  );
}

describeIfFixtures('[真实照片] 营养解析器在真实 OCR 文本上的表现', () => {
  it('样本数量足够覆盖多种包装', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
  });

  it.each(fixtures.map((f) => [f.code, f] as const))(
    '%s 能解析出至少一项营养，且不编造数据',
    (code, fixture) => {
      const parsed = parseNutritionLabel(fixture.ocrLines.join('\n'), fixture.ocrLines);

      // 1) 真实的营养成分表照片，必须至少解析出一项
      expect(hasAnyNutritionValue(parsed)).toBe(true);

      // 2) 每一项都必须有来源证据（证明是从标签上读到的，不是凭空来的）
      for (const item of parsed.evidence) {
        expect(item.line.length).toBeGreaterThan(0);
        expect(item.matched.length).toBeGreaterThan(0);
      }

      // 3) 没有任何一项是负数或荒唐值
      for (const [field, value] of Object.entries(parsed.facts)) {
        if (value === null) continue;
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        if (field === 'energy_kj') expect(value).toBeLessThan(4000);
        if (field === 'energy_kcal') expect(value).toBeLessThan(1000);
        if (field === 'sodium_mg') expect(value).toBeLessThan(20000);
        if (field.endsWith('_g')) expect(value).toBeLessThan(100);
      }

      // 4) 基准要么正确解析，要么明确留空 —— 不能默认成 100g
      if (parsed.basis.amount !== null) {
        expect(parsed.basis.amount).toBeGreaterThan(0);
      }

      // 5) 解析结果与数据库记录的对照（仅供参考，不作为断言：
      //    OCR 与数据库都可能有个别误差，硬断言会把真实差异变成噪音）
      const expected = fixture.expected.nutriments;
      const expectedProtein = expected['proteins_100g'];
      if (typeof expectedProtein === 'number' && parsed.facts.protein_g !== null) {
        expect(parsed.facts.protein_g).toBeCloseTo(expectedProtein, 0);
      }

      expect(code).toBe(fixture.code);
    },
  );
});
