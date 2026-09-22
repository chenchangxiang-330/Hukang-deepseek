/**
 * 开发期验证工具：采集真实食品包装照片作为测试样本。
 *
 * 两段式采集，因为 Open Food Facts 的两类接口限流强度差别很大：
 *   A) 搜索接口（/api/v2/search）—— 容易被限流，只用来捞条码
 *   B) 商品接口（/api/v2/product/{code}）—— 稳定得多，逐个探测是否有营养成分表照片
 *
 * 用途：给“营养成分表 Parser 能否处理真实包装照片”提供真实 OCR 文本。
 *
 * 诚实边界：macOS Vision ≠ Android ML Kit。这些 fixture 验证的是
 * **Parser 对真实 OCR 文本的处理能力**，不能替代 Android 端 ML Kit 的真机验证。
 *
 * 用法：node tools/mac-ocr/fetch-fixtures.mjs <输出目录> [目标样本数]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'HuKang-DeepSeek/1.0 (dev verification; contact: local dev)';
const OUT_DIR = process.argv[2] ?? '.dsh-cache/fixtures';
const TARGET = Number(process.argv[3] ?? '6');

const PRODUCT_FIELDS =
  'code,product_name,brands,categories,image_nutrition_url,nutriments,nutrition_data_per';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempts = 4, baseDelay = 15000) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      if (response.status === 200) return response.json();
      if (response.status === 404) return null;
      const wait = baseDelay * (i + 1);
      console.log(`  HTTP ${response.status}，等待 ${wait / 1000}s（${i + 1}/${attempts}）`);
      await sleep(wait);
    } catch (error) {
      console.log(`  异常 ${String(error).slice(0, 60)}，重试`);
      await sleep(baseDelay);
    }
  }
  return null;
}

/** A) 捞一批中国商品条码（搜索接口容易被限流，拿不到也不致命） */
async function collectCandidateCodes(limit = 120) {
  const codes = new Set();
  for (let page = 1; page <= 6 && codes.size < limit; page += 1) {
    const url =
      `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=china` +
      `&fields=code&page_size=50&page=${page}`;
    console.log(`搜索第 ${page} 页…`);
    const json = await getJson(url, 2, 20000);
    if (!json) {
      console.log('  搜索接口不可用，停止捞取');
      break;
    }
    for (const p of json.products ?? []) {
      if (p?.code) codes.add(p.code);
    }
    console.log(`  累计条码 ${codes.size}`);
    await sleep(6000);
  }
  return [...codes];
}

/** B) 逐个商品探测，挑出确实带营养成分表照片且有营养数据的 */
async function probeProducts(codes, target) {
  const kept = [];
  for (const code of codes) {
    if (kept.length >= target) break;

    const json = await getJson(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${PRODUCT_FIELDS}`,
      3,
      10000,
    );
    const product = json?.product;
    const n = product?.nutriments ?? {};
    const hasNutrition =
      n['energy-kj_100g'] != null || n['energy-kcal_100g'] != null || n.proteins_100g != null;

    if (product?.image_nutrition_url && hasNutrition) {
      kept.push(product);
      console.log(`✓ ${code} ${product.product_name ?? ''}（第 ${kept.length}/${target} 份）`);
    }

    await sleep(4000);
  }
  return kept;
}

async function download(url, path) {
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(path, buffer);
  return buffer.length;
}

function runVisionOcr(paths) {
  const output = execFileSync('swift', [join('tools', 'mac-ocr', 'ocr.swift'), ...paths], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(output);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // 允许直接用命令行给出的条码，跳过被限流的搜索
  const explicit = process.env.HUKANG_FIXTURE_CODES?.split(',').filter(Boolean) ?? [];
  const codes = explicit.length > 0 ? explicit : await collectCandidateCodes();
  console.log(`候选条码 ${codes.length} 个`);

  const products = await probeProducts(codes, TARGET);
  if (products.length === 0) {
    console.log('没有采集到可用样本，稍后再试。');
    return;
  }

  const imagePaths = [];
  const kept = [];
  for (const product of products) {
    const ext = product.image_nutrition_url.match(/\.(jpe?g|png|webp)/i)?.[1] ?? 'jpg';
    const path = join(OUT_DIR, `${product.code}.${ext.toLowerCase()}`);
    try {
      const size = await download(product.image_nutrition_url, path);
      imagePaths.push(path);
      kept.push({ product, path });
      console.log(`下载 ${product.code} (${Math.round(size / 1024)}KB)`);
    } catch (error) {
      console.log(`下载失败 ${product.code}: ${error}`);
    }
    await sleep(3000);
  }

  if (imagePaths.length === 0) {
    console.log('没有任何图片下载成功。');
    return;
  }

  console.log('调用 macOS Vision OCR…');
  const ocrResults = runVisionOcr(imagePaths);

  const fixtures = kept.map((entry, index) => {
    const ocr = ocrResults[index];
    return {
      code: entry.product.code,
      productName: entry.product.product_name ?? null,
      brands: entry.product.brands ?? null,
      categories: entry.product.categories ?? null,
      source: entry.product.image_nutrition_url,
      ocrWidth: ocr?.width ?? 0,
      ocrHeight: ocr?.height ?? 0,
      ocrLines: (ocr?.lines ?? []).map((l) => l.text),
      expected: {
        nutrition_data_per: entry.product.nutrition_data_per ?? null,
        nutriments: entry.product.nutriments ?? {},
      },
      note: 'OCR 由 macOS Vision 生成，非 Android ML Kit；仅用于验证 Parser，不能替代真机验证',
    };
  });

  const fixturesDir = join('src', 'services', 'vision', '__tests__', 'fixtures');
  mkdirSync(fixturesDir, { recursive: true });
  const outFile = join(fixturesDir, 'realLabels.json');
  writeFileSync(outFile, JSON.stringify(fixtures, null, 2));
  console.log(`已写入 ${outFile}，共 ${fixtures.length} 份真实样本`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
