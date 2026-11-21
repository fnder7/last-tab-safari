// One tab in the strip: preview on top, icon and title below. Mirrors the old in-page menu card.
import AppKit

final class TabCardView: NSView {
    static let thumbSize = NSSize(width: 200, height: 125)
    static let padding: CGFloat = 6
    static let size = NSSize(width: thumbSize.width + padding * 2, height: thumbSize.height + padding * 2 + 26)

    private let tab: MenuTab
    private let preview: NSImage?
    private let favicon: NSImage?
    private let selected: Bool

    init(tab: MenuTab, preview: NSImage?, favicon: NSImage?, selected: Bool) {
        self.tab = tab
        self.preview = preview
        self.favicon = favicon
        self.selected = selected
        super.init(frame: NSRect(origin: .zero, size: Self.size))
        setAccessibilityElement(true)
        setAccessibilityRole(.button)
        setAccessibilityLabel(tab.title)
        setAccessibilitySelected(selected)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        let p = Self.padding
        if selected {
            let card = NSBezierPath(roundedRect: bounds.insetBy(dx: 1.5, dy: 1.5), xRadius: 12, yRadius: 12)
            NSColor(srgbRed: 10 / 255, green: 132 / 255, blue: 1, alpha: 0.18).setFill()
            card.fill()
            NSColor(srgbRed: 10 / 255, green: 132 / 255, blue: 1, alpha: 1).setStroke()
            card.lineWidth = 3
            card.stroke()
        }

        let thumb = NSRect(origin: NSPoint(x: p, y: p), size: Self.thumbSize)
        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(roundedRect: thumb, xRadius: 8, yRadius: 8).addClip()
        NSColor(white: 1, alpha: 0.08).setFill()
        thumb.fill()
        if let preview, preview.size.width > 0, preview.size.height > 0 {
            // Fill the thumbnail, keeping the top of the page in view.
            let scale = max(thumb.width / preview.size.width, thumb.height / preview.size.height)
            let drawn = NSSize(width: preview.size.width * scale, height: preview.size.height * scale)
            let rect = NSRect(x: thumb.midX - drawn.width / 2, y: thumb.minY, width: drawn.width, height: drawn.height)
            preview.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
        } else if let favicon {
            favicon.draw(in: NSRect(x: thumb.midX - 24, y: thumb.midY - 24, width: 48, height: 48),
                         from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
        } else {
            let letter = String(tab.title.trimmingCharacters(in: .whitespaces).first ?? "•").uppercased() as NSString
            let attributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 40, weight: .semibold),
                .foregroundColor: NSColor(white: 0.96, alpha: 0.7),
            ]
            let size = letter.size(withAttributes: attributes)
            letter.draw(at: NSPoint(x: thumb.midX - size.width / 2, y: thumb.midY - size.height / 2), withAttributes: attributes)
        }
        NSGraphicsContext.restoreGraphicsState()

        var textX = p
        let rowY = thumb.maxY + 6
        if let favicon {
            favicon.draw(in: NSRect(x: p, y: rowY + 1, width: 16, height: 16),
                         from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
            textX += 22
        }
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byTruncatingTail
        let title = (tab.title.isEmpty ? "Untitled" : tab.title) as NSString
        title.draw(in: NSRect(x: textX, y: rowY, width: bounds.width - textX - p, height: 18), withAttributes: [
            .font: NSFont.systemFont(ofSize: 12),
            .foregroundColor: NSColor(srgbRed: 245 / 255, green: 245 / 255, blue: 247 / 255, alpha: 1),
            .paragraphStyle: style,
        ])
    }
}
