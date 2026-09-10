// astra-ocr — Handschrift-/Text-OCR über Apple Vision, plus Scan-Aufbereitung.
//
// Aufruf:
//   astra-ocr <pfad-zu-bild-oder-pdf>
//     → OCR-JSON:
//       { "pages": [ { "text": "...",
//                      "boxes": [ { "text": "...", "x": .., "y": .., "width": .., "height": .. } ],
//                      "width": <px>, "height": <px> } ] }
//       Boxen sind auf 0…1 normalisiert, Ursprung oben-links.
//
//   astra-ocr rectify <in-bild> <out.jpg>
//     → begradigt das Blatt (Perspektivkorrektur auf die erkannten Kanten),
//       zieht Graustufen + Kontrast hoch, schreibt <out.jpg>. Report auf stdout:
//       { "wrote": bool, "detected": bool, "coverage": 0..1, "blur": <zahl>,
//         "ahash": "<16 hex>", "reason": string|null }
//
// Bauen:  swiftc -O -o astra-ocr main.swift \
//           -framework Vision -framework PDFKit -framework Quartz \
//           -framework ImageIO -framework CoreImage

import Foundation
import CoreGraphics
import ImageIO
import Vision
import PDFKit
import CoreImage
import CoreImage.CIFilterBuiltins

struct BoxOut: Codable {
    let text: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct PageOut: Codable {
    let text: String
    let boxes: [BoxOut]
    let width: Double
    let height: Double
}

struct Output: Codable {
    let pages: [PageOut]
}

struct RectifyReport: Codable {
    let wrote: Bool
    let detected: Bool
    let coverage: Double
    let blur: Double
    let ahash: String
    let reason: String?
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

// ── OCR ──────────────────────────────────────────────────────────────────

/// Rendert eine PDF-Seite mit ~200 dpi in ein RGB-Bitmap.
func render(_ page: PDFPage) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    guard bounds.width > 1, bounds.height > 1 else { return nil }
    let scale: CGFloat = 200.0 / 72.0
    let pxW = max(1, Int(bounds.width * scale))
    let pxH = max(1, Int(bounds.height * scale))
    guard
        let ctx = CGContext(
            data: nil,
            width: pxW,
            height: pxH,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
    else { return nil }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: pxW, height: pxH))
    ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: -bounds.minX, y: -bounds.minY)
    page.draw(with: .mediaBox, to: ctx)
    return ctx.makeImage()
}

func recognize(_ cg: CGImage) -> (boxes: [BoxOut], text: String) {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["de-DE", "en-US"]
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = true
    }

    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
        try handler.perform([request])
    } catch {
        return ([], "")
    }

    var boxes: [BoxOut] = []
    var lines: [String] = []
    for obs in request.results ?? [] {
        guard let candidate = obs.topCandidates(1).first else { continue }
        lines.append(candidate.string)
        // Vision: normalisiert, Ursprung unten-links → in oben-links umrechnen.
        let b = obs.boundingBox
        boxes.append(
            BoxOut(
                text: candidate.string,
                x: Double(b.minX),
                y: Double(1.0 - b.maxY),
                width: Double(b.width),
                height: Double(b.height)
            )
        )
    }
    return (boxes, lines.joined(separator: "\n"))
}

func runOcr(_ url: URL) -> Never {
    guard FileManager.default.fileExists(atPath: url.path) else {
        fail("Datei nicht gefunden: \(url.path)")
    }
    var pages: [PageOut] = []

    if url.pathExtension.lowercased() == "pdf" {
        guard let doc = PDFDocument(url: url) else { fail("PDF konnte nicht geladen werden") }
        for i in 0 ..< doc.pageCount {
            guard let page = doc.page(at: i), let cg = render(page) else { continue }
            let (boxes, text) = recognize(cg)
            pages.append(
                PageOut(text: text, boxes: boxes, width: Double(cg.width), height: Double(cg.height))
            )
        }
    } else {
        guard
            let source = CGImageSourceCreateWithURL(url as CFURL, nil),
            let cg = CGImageSourceCreateImageAtIndex(source, 0, nil)
        else { fail("Bild konnte nicht geladen werden") }
        let (boxes, text) = recognize(cg)
        pages.append(
            PageOut(text: text, boxes: boxes, width: Double(cg.width), height: Double(cg.height))
        )
    }

    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(Output(pages: pages)) else {
        fail("JSON-Kodierung fehlgeschlagen")
    }
    FileHandle.standardOutput.write(data)
    exit(0)
}

// ── Scan-Aufbereitung (rectify) ─────────────────────────────────────────

func loadCGImage(_ url: URL) -> CGImage? {
    guard
        let src = CGImageSourceCreateWithURL(url as CFURL, nil),
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
    else { return nil }
    return img
}

/// Fläche eines Vierecks in (normalisierten) Punktkoordinaten – Gauß'sche Trapezformel.
func polyArea(_ pts: [CGPoint]) -> Double {
    guard pts.count >= 3 else { return 0 }
    var a = 0.0
    for i in 0 ..< pts.count {
        let j = (i + 1) % pts.count
        a += Double(pts[i].x) * Double(pts[j].y) - Double(pts[j].x) * Double(pts[i].y)
    }
    return abs(a) / 2.0
}

/// 8×8-Average-Hash als 16 Hex-Zeichen – robust gegen Neu-Kodierung, für Duplikat-Check.
func aHash(_ cg: CGImage) -> String {
    let zero = String(repeating: "0", count: 16)
    var buf = [UInt8](repeating: 0, count: 64)
    let cs = CGColorSpaceCreateDeviceGray()
    guard
        let ctx = CGContext(
            data: &buf, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 8,
            space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue
        )
    else { return zero }
    ctx.interpolationQuality = .medium
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 8, height: 8))
    let avg = buf.reduce(0) { $0 + Int($1) } / 64
    var bits: UInt64 = 0
    for i in 0 ..< 64 where Int(buf[i]) >= avg { bits |= (UInt64(1) << UInt64(63 - i)) }
    return String(format: "%016llx", bits)
}

/// Varianz des Laplace-Operators auf einem verkleinerten Graubild – klein = unscharf.
func blurScore(_ cg: CGImage) -> Double {
    let target = 800
    let scale = min(1.0, Double(target) / Double(max(1, cg.width)))
    let w = max(3, Int(Double(cg.width) * scale))
    let h = max(3, Int(Double(cg.height) * scale))
    var buf = [UInt8](repeating: 0, count: w * h)
    let cs = CGColorSpaceCreateDeviceGray()
    guard
        let ctx = CGContext(
            data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
            space: cs, bitmapInfo: CGImageAlphaInfo.none.rawValue
        )
    else { return 0 }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    var sum = 0.0, sumSq = 0.0, n = 0.0
    for y in 1 ..< (h - 1) {
        for x in 1 ..< (w - 1) {
            let i = y * w + x
            let lap =
                4.0 * Double(buf[i])
                - Double(buf[i - 1]) - Double(buf[i + 1])
                - Double(buf[i - w]) - Double(buf[i + w])
            sum += lap
            sumSq += lap * lap
            n += 1
        }
    }
    if n == 0 { return 0 }
    let mean = sum / n
    return max(0, sumSq / n - mean * mean)
}

/// Größtes Blatt-Viereck im Bild (Ursprung unten-links, normalisiert) + Flächenanteil.
func detectQuad(_ cg: CGImage) -> (quad: VNRectangleObservation, coverage: Double)? {
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])

    if #available(macOS 13.0, *) {
        let req = VNDetectDocumentSegmentationRequest()
        try? handler.perform([req])
        if let obs = req.results?.first {
            let cov = polyArea([obs.topLeft, obs.topRight, obs.bottomRight, obs.bottomLeft])
            return (obs, cov)
        }
    }

    let req = VNDetectRectanglesRequest()
    req.minimumConfidence = 0.5
    req.minimumAspectRatio = 0.3
    req.maximumObservations = 1
    req.minimumSize = 0.2
    req.quadratureTolerance = 25
    try? handler.perform([req])
    if let obs = req.results?.first {
        let cov = polyArea([obs.topLeft, obs.topRight, obs.bottomRight, obs.bottomLeft])
        return (obs, cov)
    }
    return nil
}

func perspective(_ cg: CGImage, _ q: VNRectangleObservation) -> CIImage {
    let ci = CIImage(cgImage: cg)
    let W = ci.extent.width
    let H = ci.extent.height
    func v(_ p: CGPoint) -> CGPoint { CGPoint(x: p.x * W, y: p.y * H) }
    let f = CIFilter.perspectiveCorrection()
    f.inputImage = ci
    f.topLeft = v(q.topLeft)
    f.topRight = v(q.topRight)
    f.bottomLeft = v(q.bottomLeft)
    f.bottomRight = v(q.bottomRight)
    return f.outputImage ?? ci
}

func enhance(_ ci: CIImage) -> CIImage {
    let c = CIFilter.colorControls()
    c.inputImage = ci
    c.saturation = 0
    c.contrast = 1.12
    c.brightness = 0.0
    return c.outputImage ?? ci
}

func writeJPEG(_ ci: CIImage, to url: URL, quality: Double) -> Bool {
    let ctx = CIContext()
    guard let cg = ctx.createCGImage(ci, from: ci.extent) else { return false }
    guard
        let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.jpeg" as CFString, 1, nil)
    else { return false }
    CGImageDestinationAddImage(
        dest, cg,
        [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
    )
    return CGImageDestinationFinalize(dest)
}

func runRectify(_ inURL: URL, _ outURL: URL) -> Never {
    guard FileManager.default.fileExists(atPath: inURL.path), let cg = loadCGImage(inURL) else {
        fail("Bild konnte nicht geladen werden: \(inURL.path)")
    }

    let blur = blurScore(cg)
    let hash = aHash(cg)

    var detected = false
    var coverage = 0.0
    var reason: String? = nil
    var result: CIImage

    if let d = detectQuad(cg), d.coverage >= 0.18 {
        detected = true
        coverage = d.coverage
        result = enhance(perspective(cg, d.quad))
    } else {
        result = enhance(CIImage(cgImage: cg))
        reason = "kein Blatt erkannt"
    }

    let wrote = writeJPEG(result, to: outURL, quality: 0.85)
    let report = RectifyReport(
        wrote: wrote, detected: detected, coverage: coverage,
        blur: blur, ahash: hash, reason: reason
    )
    if let data = try? JSONEncoder().encode(report) {
        FileHandle.standardOutput.write(data)
    }
    exit(wrote ? 0 : 1)
}

// ── main ──────────────────────────────────────────────────────────────────

let args = CommandLine.arguments
guard args.count >= 2 else {
    fail("usage: astra-ocr <bild-oder-pdf>  |  astra-ocr rectify <in-bild> <out.jpg>")
}

if args[1] == "rectify" {
    guard args.count >= 4 else { fail("usage: astra-ocr rectify <in-bild> <out.jpg>") }
    runRectify(URL(fileURLWithPath: args[2]), URL(fileURLWithPath: args[3]))
}

runOcr(URL(fileURLWithPath: args[1]))
