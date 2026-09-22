/**
 * 图片落盘与文件校验（产品需求 §40，Camera 稳定性为 P0）
 *
 * 相机拿到的临时文件必须变成“真实、可读、非空”的持久文件，才允许进入识别流程：
 *   Capture → FILE_EXISTS → FILE_SIZE > 0 → 落到 App 文档目录 → 交给 OCR / Vision
 *
 * 用 expo-file-system SDK 54+ 的新 API（File / Directory / Paths）。
 * 旧根函数（FileSystem.copyAsync 等）在 v57 会直接抛错，禁止使用。
 */

import { Directory, File, Paths } from 'expo-file-system';

import { HuKangError } from '@/domain/errors';
import { newId } from '@/utils/id';

/** 相对 App 文档目录的图片子目录 */
const IMAGE_DIR_NAME = 'food-images';

function imagesDirectory(): Directory {
  const dir = new Directory(Paths.document, IMAGE_DIR_NAME);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

export interface StoredImage {
  /** 持久化的 file:// 地址，可直接交给 expo-image 显示或后续识别 */
  uri: string;
  /** 字节数；保证 > 0 */
  size: number;
  /** 原始来源地址（相机临时文件或相册地址），用于 Developer Mode 排查 */
  originalUri: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
}

export interface PersistImageInput {
  uri: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  /** 文件名前缀，例如 'barcode' / 'nutrition'，便于开发者排查 */
  prefix?: string;
}

function extensionFor(sourceUri: string, mimeType?: string | null): string {
  const match = /\.([a-zA-Z0-9]+)(?:\?|#|$)/.exec(sourceUri);
  if (match) return match[1].toLowerCase();
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * 把相机/相册给的地址复制成 App 私有目录里的持久图片，并做硬校验。
 *
 * 任何一步不成立都抛 HuKangError('PHOTO_FILE_INVALID')，
 * 绝不把“空文件/不存在的文件”放行到识别层（§40）。
 */
export async function persistImage(input: PersistImageInput): Promise<StoredImage> {
  const { uri, prefix = 'img' } = input;

  if (!uri) {
    throw new HuKangError('PHOTO_FILE_INVALID', {
      technical: { message: '图片来源地址为空' },
    });
  }

  const source = new File(uri);
  if (!source.exists) {
    throw new HuKangError('PHOTO_FILE_INVALID', {
      technical: { message: '来源图片文件不存在', fileUri: uri },
    });
  }

  const dir = imagesDirectory();
  const target = new File(dir, `${prefix}-${newId()}.${extensionFor(uri, input.mimeType)}`);

  try {
    await source.copy(target);
  } catch (error) {
    throw new HuKangError('PHOTO_FILE_INVALID', {
      technical: {
        message: '复制图片到 App 目录失败',
        fileUri: uri,
        extra: { error: String(error) },
      },
    });
  }

  const stored = new File(target.uri);
  const size = stored.size ?? 0;

  if (!stored.exists || size <= 0) {
    throw new HuKangError('PHOTO_FILE_INVALID', {
      technical: {
        message: '落盘后的图片不存在或大小为 0',
        fileUri: target.uri,
        fileSize: size,
      },
    });
  }

  return {
    uri: stored.uri,
    size,
    originalUri: uri,
    mimeType: input.mimeType ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
  };
}

/** 删除不再需要的图片；失败不抛错，避免影响主流程 */
export function deleteImageQuietly(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 忽略：清理失败不影响业务
  }
}

/** Developer Mode 用：读取文件事实，不修改任何东西 */
export function inspectImage(uri: string): {
  exists: boolean;
  size: number;
  extension: string;
  lastModified: number | null;
} {
  const file = new File(uri);
  return {
    exists: file.exists,
    size: file.size ?? 0,
    extension: file.extension,
    lastModified: file.lastModified ?? null,
  };
}
