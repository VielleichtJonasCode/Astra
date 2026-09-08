// astra-ocr — Handschrift-/Text-OCR über Apple Vision.
//
// Aufruf:  astra-ocr <pfad-zu-bild-oder-pdf>
// Ausgabe: JSON auf stdout:
//   { "pages": [ { "text": "...",
//                  "boxes": [ { "text": "...", "x": .., "y": .., "width": .., "height": .. } ],
//                  "width": <px>, "height": <px> } ] }
// Boxen sind auf 0…1 normalisiert, Ursprung oben-links.
//
// Bauen:  swiftc -O -o astra-ocr main.swift \
//           -framework Vision -framework PDFKit -framework Quartz -framework ImageIO

import Foundation
import CoreGraphics
import ImageIO
import Vision
import PDFKit

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

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

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

// ── main ──────────────────────────────────────────────────────────────────

let args = CommandLine.arguments
guard args.count >= 2 else { fail("usage: astra-ocr <bild-oder-pdf>") }
let url = URL(fileURLWithPath: args[1])
guard FileManager.default.fileExists(atPath: url.path) else { fail("Datei nicht gefunden: \(url.path)") }

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
guard let data = try? encoder.encode(Output(pages: pages)) else { fail("JSON-Kodierung fehlgeschlagen") }
FileHandle.standardOutput.write(data)
