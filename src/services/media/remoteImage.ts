/**
 * 把联网商品的图片下载到 App 私有目录。
 *
 * 目的（§22）：第一次联网认识，之后即使断网也能打开已经认识的商品。
 * 下载失败**绝不能阻断商品落库** —— 图片只是锦上添花，返回 null 即可。
 */

import { Directory, File, Paths } from 'expo-file-system';

const PRODUCT_IMAGE_DIR = 'product-images';

function productImagesDirectory(): Directory {
  const dir = new Directory(Paths.document, PRODUCT_IMAGE_DIR);
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return dir;
}

export async function downloadRemoteImage(
  url: string | null | undefined,
  fileName: string,
): Promise<string | null> {
  if (!url) return null;
  try {
    const dir = productImagesDirectory();
    const target = new File(dir, fileName);
    const downloaded = await File.downloadFileAsync(url, target);
    const size = downloaded.size ?? 0;
    if (!downloaded.exists || size <= 0) {
      return null;
    }
    return downloaded.uri;
  } catch {
    // 网络异常、图片 404、磁盘问题都归到这里：不阻塞主流程
    return null;
  }
}
