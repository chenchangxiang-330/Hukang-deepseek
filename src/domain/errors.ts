/**
 * 错误分类体系（产品需求 §42 / §43）
 *
 * 设计要点：
 * 1. 五种扫描任务（条形码 / 拍商品 / 营养成分表 / 配料表 / 日期）各有独立错误码，
 *    绝对不允许统一成 UNKNOWN_PRODUCT。
 * 2. 每个错误分成两层：
 *    - technical：给 Developer Mode 看的原始信息（JSON / 路径 / HTTP 状态 / 异常栈）
 *    - userMessage：给普通用户看的一句话，禁止出现技术词汇（§34）
 */

export const ERROR_CODES = [
  // 条形码
  'BARCODE_NOT_DETECTED',
  'BARCODE_NO_MATCH',
  // 拍照 / 文件
  'PHOTO_CAPTURE_FAILED',
  'PHOTO_FILE_INVALID',
  // OCR
  'OCR_NO_TEXT',
  'OCR_FAILED',
  // 解析
  'NUTRITION_PARSE_FAILED',
  'INGREDIENTS_PARSE_FAILED',
  'DATE_PARSE_FAILED',
  // 拍商品
  'PRODUCT_VISUAL_FAILED',
  'PRODUCT_SEARCH_NO_MATCH',
  // 网络 / 在线视觉
  'NETWORK_ERROR',
  'VISION_ERROR',
  'VISION_NOT_CONFIGURED',
  // 图片质量（§41，用于给出可操作建议而不是笼统失败）
  'IMAGE_TOO_BLURRY',
  'IMAGE_TOO_DARK',
  'IMAGE_TOO_BRIGHT',
  'IMAGE_GLARE',
  // 权限
  'CAMERA_PERMISSION_DENIED',
  'MEDIA_PERMISSION_DENIED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** 扫描任务类型（§17：五种任务必须分开） */
export type ScanTask =
  | 'barcode'
  | 'product_photo'
  | 'nutrition_label'
  | 'ingredients_label'
  | 'expiry_date';

/** 面向普通用户的安全文案。禁止技术词汇。 */
const USER_MESSAGES: Record<ErrorCode, string> = {
  BARCODE_NOT_DETECTED: '没有识别到条形码，把条形码放进取景框再试一次。',
  BARCODE_NO_MATCH: '这个条形码暂时没有查到商品信息。',
  PHOTO_CAPTURE_FAILED: '照片没有拍成功，请再拍一次。',
  PHOTO_FILE_INVALID: '照片没有保存成功，请再拍一次。',
  OCR_NO_TEXT: '没有读出文字，靠近一点、对准再拍一次。',
  OCR_FAILED: '文字识别没有完成，请再试一次。',
  NUTRITION_PARSE_FAILED: '没有读出完整的营养成分表，可以手动填写。',
  INGREDIENTS_PARSE_FAILED: '没有读出完整的配料表，可以手动填写。',
  DATE_PARSE_FAILED: '没有认出日期，可以手动填写。',
  PRODUCT_VISUAL_FAILED: '没能认出这是什么商品，可以再拍一张正面包装。',
  PRODUCT_SEARCH_NO_MATCH: '暂时没有找到完全匹配的商品。',
  NETWORK_ERROR: '网络似乎不太顺畅，稍后再试。',
  VISION_ERROR: '识别服务暂时不可用，稍后再试。',
  VISION_NOT_CONFIGURED: '还没有开启联网识别。',
  IMAGE_TOO_BLURRY: '照片有点糊，再靠近一点。',
  IMAGE_TOO_DARK: '光线有点暗。',
  IMAGE_TOO_BRIGHT: '光线太亮了，避开直射光。',
  IMAGE_GLARE: '包装反光较强，换个角度试试。',
  CAMERA_PERMISSION_DENIED: '需要相机权限才能拍照。',
  MEDIA_PERMISSION_DENIED: '需要相册权限才能选择照片。',
};

/**
 * 每个错误码对应的可操作出路（§33：OCR 失败不能无反应）。
 */
export type RecoveryAction = 'retake' | 'import' | 'editManual' | 'retry' | 'manualCreate';

const RECOVERY_ACTIONS: Record<ErrorCode, RecoveryAction[]> = {
  BARCODE_NOT_DETECTED: ['retake', 'import'],
  BARCODE_NO_MATCH: ['retake', 'manualCreate'],
  PHOTO_CAPTURE_FAILED: ['retake'],
  PHOTO_FILE_INVALID: ['retake', 'import'],
  OCR_NO_TEXT: ['retake', 'import', 'editManual'],
  OCR_FAILED: ['retake', 'editManual'],
  NUTRITION_PARSE_FAILED: ['retake', 'editManual'],
  INGREDIENTS_PARSE_FAILED: ['retake', 'editManual'],
  DATE_PARSE_FAILED: ['retake', 'editManual'],
  PRODUCT_VISUAL_FAILED: ['retake', 'editManual', 'manualCreate'],
  PRODUCT_SEARCH_NO_MATCH: ['manualCreate', 'retake'],
  NETWORK_ERROR: ['retry'],
  VISION_ERROR: ['retry', 'editManual'],
  VISION_NOT_CONFIGURED: ['editManual'],
  IMAGE_TOO_BLURRY: ['retake', 'import'],
  IMAGE_TOO_DARK: ['retake', 'import'],
  IMAGE_TOO_BRIGHT: ['retake', 'import'],
  IMAGE_GLARE: ['retake', 'import'],
  CAMERA_PERMISSION_DENIED: ['retake'],
  MEDIA_PERMISSION_DENIED: ['import'],
};

export interface TechnicalDetail {
  /** 内部错误码，可能来自原生层 */
  nativeCode?: string;
  message?: string;
  stack?: string;
  httpStatus?: number;
  fileUri?: string;
  fileSize?: number;
  rawText?: string;
  parserOutput?: unknown;
  extra?: Record<string, unknown>;
}

export class HuKangError extends Error {
  readonly code: ErrorCode;
  readonly task: ScanTask | null;
  readonly technical: TechnicalDetail;
  readonly userMessage: string;
  readonly recovery: RecoveryAction[];

  constructor(
    code: ErrorCode,
    options: {
      task?: ScanTask | null;
      technical?: TechnicalDetail;
      /** 覆盖默认文案（仍然必须是面向用户的安全文案） */
      userMessage?: string;
    } = {},
  ) {
    super(code);
    this.name = 'HuKangError';
    this.code = code;
    this.task = options.task ?? null;
    this.technical = options.technical ?? {};
    this.userMessage = options.userMessage ?? USER_MESSAGES[code];
    this.recovery = RECOVERY_ACTIONS[code];
  }

  /** Developer Mode 用；普通用户界面绝不能渲染这个 */
  toTechnicalJSON(): Record<string, unknown> {
    return {
      code: this.code,
      task: this.task,
      userMessage: this.userMessage,
      ...this.technical,
    };
  }
}

export function isHuKangError(value: unknown): value is HuKangError {
  return value instanceof HuKangError;
}

/** 把任意异常收敛成 HuKangError，避免上层处理 undefined。 */
export function toHuKangError(
  value: unknown,
  fallbackCode: ErrorCode,
  task: ScanTask | null = null,
): HuKangError {
  if (isHuKangError(value)) return value;
  const err = value as { message?: string; code?: string; stack?: string } | undefined;
  return new HuKangError(fallbackCode, {
    task,
    technical: {
      message: err?.message,
      nativeCode: err?.code,
      stack: err?.stack,
    },
  });
}

export function userMessageOf(error: unknown, fallbackCode: ErrorCode = 'OCR_FAILED'): string {
  return toHuKangError(error, fallbackCode).userMessage;
}
