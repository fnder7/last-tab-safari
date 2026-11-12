// Renders all Last Tab icons. Run: swift scripts/icons.swift (from the repo root).
// App icon: blue rounded square, two white tabs, back arrow. Toolbar: blue outline glyph.
import AppKit

func png(_ px: Int, _ path: String, draw: (CGContext) -> Void) {
  let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.translateBy(x: 0, y: CGFloat(px))
  ctx.scaleBy(x: 1, y: -1) // top-left origin
  draw(ctx)
  let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

func rounded(_ r: CGRect, _ radius: CGFloat) -> CGPath {
  CGPath(roundedRect: r, cornerWidth: radius, cornerHeight: radius, transform: nil)
}

/// Back arrow inside a tab: a hook coming up from below and pointing left.
func arrow(_ ctx: CGContext, at o: CGPoint, unit u: CGFloat, width: CGFloat) {
  let p = CGMutablePath()
  p.move(to: CGPoint(x: o.x + 4 * u, y: o.y + 3.2 * u))
  p.addLine(to: CGPoint(x: o.x + 4 * u, y: o.y + 1.2 * u))
  p.addQuadCurve(to: CGPoint(x: o.x + 2.2 * u, y: o.y - 0.6 * u), control: CGPoint(x: o.x + 4 * u, y: o.y - 0.6 * u))
  p.addLine(to: CGPoint(x: o.x - 1.6 * u, y: o.y - 0.6 * u))
  ctx.addPath(p)
  ctx.setLineWidth(width)
  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)
  ctx.strokePath()
  let head = CGMutablePath()
  head.move(to: CGPoint(x: o.x - 3.6 * u, y: o.y - 0.6 * u))
  head.addLine(to: CGPoint(x: o.x - 1.2 * u, y: o.y - 2.8 * u))
  head.addLine(to: CGPoint(x: o.x - 1.2 * u, y: o.y + 1.6 * u))
  head.closeSubpath()
  ctx.addPath(head)
  ctx.setLineWidth(width * 0.35)
  ctx.drawPath(using: .fillStroke)
}

/// Full-colour icon on a 1024 grid (macOS template: 824pt body, 100pt margin).
func appIcon(_ px: Int, _ path: String) {
  png(px, path) { ctx in
    let s = CGFloat(px) / 1024
    ctx.scaleBy(x: s, y: s)
    let body = rounded(CGRect(x: 100, y: 100, width: 824, height: 824), 185)
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 10), blur: 20, color: CGColor(gray: 0, alpha: 0.3))
    ctx.addPath(body); ctx.setFillColor(CGColor(gray: 0, alpha: 1)); ctx.fillPath()
    ctx.restoreGState()
    ctx.saveGState()
    ctx.addPath(body); ctx.clip()
    let gradient = CGGradient(colorsSpace: nil, colors: [
      CGColor(srgbRed: 0.33, green: 0.66, blue: 1, alpha: 1),
      CGColor(srgbRed: 0, green: 0.38, blue: 0.87, alpha: 1),
    ] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 512, y: 100), end: CGPoint(x: 512, y: 924), options: [])
    ctx.restoreGState()

    ctx.addPath(rounded(CGRect(x: 360, y: 292, width: 400, height: 310), 48))
    ctx.setFillColor(CGColor(gray: 1, alpha: 0.5)); ctx.fillPath()
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 8), blur: 24, color: CGColor(gray: 0, alpha: 0.25))
    ctx.addPath(rounded(CGRect(x: 264, y: 422, width: 400, height: 310), 48))
    ctx.setFillColor(CGColor(gray: 1, alpha: 1)); ctx.fillPath()
    ctx.restoreGState()

    let blue = CGColor(srgbRed: 0.04, green: 0.52, blue: 1, alpha: 1)
    ctx.setStrokeColor(blue); ctx.setFillColor(blue)
    arrow(ctx, at: CGPoint(x: 458, y: 568), unit: 34, width: 40)
  }
}

/// Outline glyph on a 32 grid. Safari shows toolbar icons as-is (no tinting),
/// so it uses system blue, which reads on both light and dark toolbars.
func toolbarIcon(_ px: Int, _ path: String) {
  png(px, path) { ctx in
    let s = CGFloat(px) / 32
    ctx.scaleBy(x: s, y: s)
    let blue = CGColor(srgbRed: 0.04, green: 0.52, blue: 1, alpha: 1)
    ctx.setStrokeColor(blue)
    ctx.setFillColor(blue)
    ctx.setLineWidth(2)
    ctx.addPath(rounded(CGRect(x: 10.5, y: 5, width: 18, height: 14), 3)); ctx.strokePath()
    ctx.setBlendMode(.clear)
    ctx.addPath(rounded(CGRect(x: 2.5, y: 10, width: 20, height: 17), 4)); ctx.fillPath()
    ctx.setBlendMode(.normal)
    ctx.addPath(rounded(CGRect(x: 3.5, y: 11, width: 18, height: 15), 3)); ctx.strokePath()
    arrow(ctx, at: CGPoint(x: 12.2, y: 18.3), unit: 1.5, width: 2)
  }
}

let assets = "Last Tab/Last Tab/Assets.xcassets/AppIcon.appiconset"
for size in [16, 32, 128, 256, 512] {
  appIcon(size, "\(assets)/mac-icon-\(size)@1x.png")
  appIcon(size * 2, "\(assets)/mac-icon-\(size)@2x.png")
}
appIcon(128, "Last Tab/Last Tab/Resources/Icon.png")
for size in [48, 96, 128, 256, 512] { appIcon(size, "static/images/icon-\(size).png") }
for size in [16, 19, 32, 38] { toolbarIcon(size, "static/images/toolbar-\(size).png") }
print("icons written")
