/**
 * 采集页（产品需求 §40，Camera 稳定性为 P0）
 *
 * 完整链路：
 *   权限 → Camera Preview → Capture → 真实图片 → FILE_EXISTS → FILE_SIZE > 0
 *        → 落盘到 App 文档目录 → 交给下一步识别
 *
 * 也支持从相册导入同一套 pipeline，保证没有真机时识别链仍可被测（§59）。
 */

import {
  Camera,
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
  type FlashMode,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KangKang } from '@/components/KangKang';
import { SUPPORTED_BARCODE_TYPES } from '@/domain/barcode';
import { getScanTaskDefinition } from '@/domain/scanTasks';
import { HuKangError, ScanTask, toHuKangError } from '@/domain/errors';
import { persistImage } from '@/services/media/imageStore';
import { colors, radii, spacing, typography } from '@/theme';

const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on'];
const FLASH_LABEL: Record<FlashMode, string> = {
  off: '闪光关',
  auto: '自动',
  on: '闪光开',
  // 后置摄像头用不到屏幕补光，保留文案只为覆盖类型
  screen: '屏幕补光',
};

export default function CaptureScreen() {
  const { task: taskParam } = useLocalSearchParams<{ task?: string }>();
  const task = (taskParam ?? 'product_photo') as ScanTask;
  const definition = getScanTaskDefinition(task);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const isBarcodeTask = task === 'barcode';
  /** 防止连续回调重复跳转 */
  const handledRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [error, setError] = useState<HuKangError | null>(null);

  /** 扫码命中后统一走查询页（§19 的第一步） */
  const goToBarcodeResult = useCallback(
    (raw: string, type: string | undefined) => {
      if (handledRef.current) return;
      handledRef.current = true;
      router.replace({ pathname: '/scan/barcode-result', params: { raw, type: type ?? '' } });
    },
    [router],
  );

  const handleBarcodeScanned = useCallback(
    (scan: BarcodeScanningResult) => {
      if (!scan?.data) return;
      goToBarcodeResult(scan.data, scan.type);
    },
    [goToBarcodeResult],
  );

  /** 采集成功后统一交给结果页，参数只传字符串 */
  const goToResult = useCallback(
    (uri: string, size: number, width: number | null, height: number | null) => {
      // 拍商品走完整的“质量检查 → 条码 → OCR → 搜索”流程（§23）
      if (task === 'product_photo') {
        router.replace({ pathname: '/scan/product-result', params: { uri } });
        return;
      }

      router.replace({
        pathname: '/scan/result',
        params: {
          task,
          uri,
          size: String(size),
          width: width == null ? '' : String(width),
          height: height == null ? '' : String(height),
        },
      });
    },
    [router, task],
  );

  const handleCapture = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const camera = cameraRef.current;
      if (!camera) {
        throw new HuKangError('PHOTO_CAPTURE_FAILED', {
          task,
          technical: { message: '相机尚未就绪' },
        });
      }

      // skipProcessing 保持 false：让原生层按 EXIF 把方向纠正过来（§40 方向正确）
      const picture = await camera.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
        exif: false,
      });

      if (!picture?.uri) {
        throw new HuKangError('PHOTO_CAPTURE_FAILED', {
          task,
          technical: { message: '相机没有返回图片地址' },
        });
      }

      const stored = await persistImage({
        uri: picture.uri,
        width: picture.width,
        height: picture.height,
        prefix: task,
      });

      goToResult(stored.uri, stored.size, stored.width, stored.height);
    } catch (err) {
      setError(toHuKangError(err, 'PHOTO_CAPTURE_FAILED', task));
    } finally {
      setBusy(false);
    }
  }, [busy, goToResult, task]);

  const handleImport = useCallback(async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        throw new HuKangError('PHOTO_FILE_INVALID', {
          task,
          technical: { message: '相册没有返回图片地址' },
        });
      }

      const stored = await persistImage({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType ?? null,
        prefix: `${task}-import`,
      });

      // 条码任务：从图片里解码条码，走与他人相同的查询链路。
      // 这条路径让没有真机时也能用图片验证扫码逻辑（§59）。
      if (isBarcodeTask) {
        const found = await Camera.scanFromURLAsync(stored.uri, [
          ...SUPPORTED_BARCODE_TYPES,
        ] as BarcodeType[]);

        const first = found.find((r) => !!r?.data);
        if (!first) {
          throw new HuKangError('BARCODE_NOT_DETECTED', {
            task,
            technical: {
              message: '导入的图片里没有识别到条形码',
              fileUri: stored.uri,
              fileSize: stored.size,
            },
          });
        }
        goToBarcodeResult(first.data, first.type);
        return;
      }

      goToResult(stored.uri, stored.size, stored.width, stored.height);
    } catch (err) {
      setError(toHuKangError(err, 'PHOTO_FILE_INVALID', task));
    } finally {
      setBusy(false);
    }
  }, [busy, goToBarcodeResult, goToResult, isBarcodeTask, task]);

  // ---------- 权限 ----------
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.mint} />
      </View>
    );
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={[styles.centered, { paddingHorizontal: spacing.xl }]}>
        <KangKang size={92} mood="concerned" />
        <Text style={styles.permTitle}>需要相机权限</Text>
        <Text style={styles.permBody}>
          {blocked
            ? '相机权限已被关闭，请在系统设置里重新打开。'
            : '护康需要用相机拍摄商品和食品标签。'}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.primaryButton}
          onPress={() => {
            if (blocked) {
              Linking.openSettings();
            } else {
              requestPermission();
            }
          }}
        >
          <Text style={styles.primaryButtonText}>{blocked ? '去设置' : '允许使用相机'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.textButton} onPress={handleImport}>
          <Text style={styles.textButtonText}>改从相册导入</Text>
        </Pressable>
      </View>
    );
  }

  // ---------- 采集 ----------
  // 只有条码任务才开启扫码监听，避免其它任务被误触发跳转
  const barcodeProps = isBarcodeTask
    ? {
        barcodeScannerSettings: {
          barcodeTypes: [...SUPPORTED_BARCODE_TYPES] as BarcodeType[],
        },
        onBarcodeScanned: handleBarcodeScanned,
      }
    : {};

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
        mode="picture"
        {...barcodeProps}
      />

      {/* 条码模式：给一个取景框，帮助用户把条纹放正 */}
      {isBarcodeTask ? (
        <View pointerEvents="none" style={styles.scanFrameWrap}>
          <View style={styles.scanFrame} />
        </View>
      ) : null}

      {/* 顶部：拍摄提示（§18 的提示语在真实取景时再出现一次） */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>
            {isBarcodeTask
              ? '把条形码放进框里，会自动识别。'
              : definition?.hint ?? '把要识别的内容放进取景框。'}
          </Text>
        </View>
      </View>

      {/* 底部控制区：玻璃只用于此处等少量区域（§51） */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error.userMessage}</Text>
          </View>
        ) : null}

        <View style={styles.controlsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="从相册导入"
            onPress={handleImport}
            disabled={busy}
            style={styles.sideButton}
          >
            <Text style={styles.sideButtonText}>相册</Text>
          </Pressable>

          {isBarcodeTask ? (
            <View style={styles.scanIndicator}>
              {busy ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.scanIndicatorText}>识别中</Text>
              )}
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="拍照"
              onPress={handleCapture}
              disabled={busy}
              style={({ pressed }) => [
                styles.shutter,
                pressed && { opacity: 0.75 },
                busy && { opacity: 0.45 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.mintDark} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`闪光灯：${FLASH_LABEL[flash]}`}
            onPress={() =>
              setFlash((current) => FLASH_ORDER[(FLASH_ORDER.indexOf(current) + 1) % FLASH_ORDER.length])
            }
            disabled={busy}
            style={styles.sideButton}
          >
            <Text style={styles.sideButtonText}>{FLASH_LABEL[flash]}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  permTitle: { ...typography.section, color: colors.text },
  permBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  primaryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  primaryButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
  textButton: { padding: spacing.sm },
  textButtonText: { color: colors.textSecondary, fontSize: 14 },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  hintPill: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  hintText: { color: '#FFFFFF', fontSize: 13, textAlign: 'center' },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideButton: {
    width: 64,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideButtonText: { color: colors.text, fontSize: 13, fontWeight: '500' },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.mintLine,
  },

  scanFrameWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: '78%',
    height: 150,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  scanIndicator: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIndicatorText: { color: colors.textInverse, fontSize: 13, fontWeight: '500' },
});
