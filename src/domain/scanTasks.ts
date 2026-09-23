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
  /**
   * 这个入口现在能不能用。
   *
   * 真机实测教训：五个入口原本长得一模一样，用户点进去才发现有两个是
   * 「识别能力尚未接入」的空页面——他会认为整个 App 是半成品。
   * 能力没做完就必须在入口上写清楚，不能让人撞墙才发现在修路。
   */
  status: 'ready' | 'coming_soon';
}

export const SCAN_TASKS: ScanTaskDefinition[] = [
  {
    key: 'barcode',
    title: '商品条形码',
    hint: '对准包装背面或侧面的商品条形码。',
    outputs: '商品身份',
    status: 'ready',
  },
  {
    key: 'product_photo',
    title: '拍商品',
    hint: '拍完整包装正面，让品牌名、商品名和规格尽量清晰。',
    outputs: '商品身份',
    status: 'ready',
  },
  {
    key: 'nutrition_label',
    title: '营养成分表',
    hint: '拍完整营养成分表。',
    outputs: '营养数据',
    status: 'ready',
  },
  {
    key: 'ingredients_label',
    title: '配料表',
    hint: '拍清楚完整配料文字。',
    outputs: '配料数据',
    status: 'coming_soon',
  },
  {
    key: 'expiry_date',
    title: '生产日期 / 保质期',
    hint: '拍清楚包装上的日期或喷码。',
    outputs: '保质期',
    status: 'coming_soon',
  },
];

/** 给「还没做完」的入口用的统一说明 —— 面向用户，不要写成技术术语 */
export const COMING_SOON_TITLE = '还在开发中';
export const COMING_SOON_MESSAGE = '这个功能还没做完，下个版本就能用了。先试试上面三个吧。';

export function getScanTaskDefinition(key: string | undefined): ScanTaskDefinition | undefined {
  if (!key) return undefined;
  return SCAN_TASKS.find((t) => t.key === key);
}
