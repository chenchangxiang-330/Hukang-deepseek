/**
 * 五种扫描任务的元数据（产品需求 §17 / §18）
 *
 * 这五种任务目的不同、输入不同、识别算法不同、输出结果不同，
 * 因此入口必须分开，绝不允许合并成一个“扫一扫”大杂烩。
 */

import { ScanTask } from './errors';

export interface ScanTaskDefinition {
  key: ScanTask;
  title: string;
  /** 一句拍摄提示，配合示意图使用 */
  hint: string;
  /** 该任务的识别结果会写入商品/库存的哪个部分，用于结果页文案 */
  outputs: string;
}

export const SCAN_TASKS: ScanTaskDefinition[] = [
  {
    key: 'barcode',
    title: '商品条形码',
    hint: '对准包装背面或侧面的商品条形码。',
    outputs: '商品身份',
  },
  {
    key: 'product_photo',
    title: '拍商品',
    hint: '拍完整包装正面，让品牌名、商品名和规格尽量清晰。',
    outputs: '商品身份',
  },
  {
    key: 'nutrition_label',
    title: '营养成分表',
    hint: '拍完整营养成分表。',
    outputs: '营养数据',
  },
  {
    key: 'ingredients_label',
    title: '配料表',
    hint: '拍清楚完整配料文字。',
    outputs: '配料数据',
  },
  {
    key: 'expiry_date',
    title: '生产日期 / 保质期',
    hint: '拍清楚包装上的日期或喷码。',
    outputs: '保质期',
  },
];

export function getScanTaskDefinition(key: string | undefined): ScanTaskDefinition | undefined {
  if (!key) return undefined;
  return SCAN_TASKS.find((t) => t.key === key);
}
