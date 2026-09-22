// 开发期验证工具：用 macOS Vision 框架对真实食品包装照片做 OCR。
//
// 为什么需要它：
//   App 里的 OCR 是 Android 上的 ML Kit，没有真机/模拟器就跑不了。
//   但“营养成分表 Parser 到底能不能解析真实包装照片”这件事，
//   可以在 Mac 上用系统自带的 Vision OCR 拿到**真实 OCR 文本**来验证。
//
// 诚实边界：macOS Vision ≠ Android ML Kit。两者识别结果会有差异。
//   这个工具验证的是 **Parser 对真实 OCR 文本的处理能力**，
//   不能替代 Android 端 ML Kit 的真机验证。
//
// 用法：
//   swift ocr.swift <图片路径> [更多图片...]
// 输出：JSON 数组，每项 { file, width, height, lines: [{ text, top, height }] }

import AppKit
import Foundation
import Vision

struct OcrLine: Codable {
  let text: String
  let top: Double
  let height: Double
}

struct OcrImage: Codable {
  let file: String
  let width: Int
  let height: Int
  let lines: [OcrLine]
  let error: String?
}

func recognize(path: String) -> OcrImage {
  guard let image = NSImage(contentsOfFile: path),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else {
    return OcrImage(file: path, width: 0, height: 0, lines: [], error: "无法读取图片")
  }

  let width = cgImage.width
  let height = cgImage.height

  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  // 中文优先，英文兜底（食品标签上常混有英文与数字）
  request.recognitionLanguages = ["zh-Hans", "en-US"]
  request.usesLanguageCorrection = true

  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return OcrImage(file: path, width: width, height: height, lines: [], error: "\(error)")
  }

  guard let observations = request.results else {
    return OcrImage(file: path, width: width, height: height, lines: [], error: nil)
  }

  var lines: [OcrLine] = []
  for observation in observations {
    guard let candidate = observation.topCandidates(1).first else { continue }
    let box = observation.boundingBox
    // Vision 坐标系原点在左下，转成从上往下，与 Android 端 ML Kit 的 boundingBox 语义一致
    let topFromTop = 1.0 - box.origin.y - box.size.height
    lines.append(
      OcrLine(text: candidate.string, top: topFromTop, height: box.size.height)
    )
  }
  lines.sort { $0.top < $1.top }

  return OcrImage(file: path, width: width, height: height, lines: lines, error: nil)
}

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else {
  FileHandle.standardError.write("用法: swift ocr.swift <图片路径> [...]\n".data(using: .utf8)!)
  exit(1)
}

let results = args.map { recognize(path: $0) }
let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
if let data = try? encoder.encode(results) {
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
