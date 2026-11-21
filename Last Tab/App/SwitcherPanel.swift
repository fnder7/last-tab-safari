// The tab strip: a non-activating panel over Safari, like Cmd-Tab. It never takes focus or clicks.
import AppKit

@MainActor
final class SwitcherPanel {
    private static let gap: CGFloat = 12
    private static let inset: CGFloat = 14

    private let previews: (Int) -> NSImage?
    private let favicons = FaviconCache()
    private var panel: NSPanel?
    private var shown: (tabs: [MenuTab], index: Int, screen: NSScreen)?

    /// `previews` loads the stored preview of a tab id.
    init(previews: @escaping (Int) -> NSImage?) {
        self.previews = previews
    }

    func show(tabs: [MenuTab], index: Int, on screen: NSScreen) {
        shown = (tabs, index, screen)
        let panel = self.panel ?? makePanel()
        self.panel = panel

        let card = TabCardView.size
        let fullWidth = CGFloat(tabs.count) * card.width + CGFloat(max(tabs.count - 1, 0)) * Self.gap
        let maxWidth = screen.visibleFrame.width * 0.9 - Self.inset * 2
        let visibleWidth = min(fullWidth, maxWidth)
        let size = NSSize(width: visibleWidth + Self.inset * 2, height: card.height + Self.inset * 2)

        // Scroll so the selected card is in view.
        let selectedMinX = CGFloat(index) * (card.width + Self.gap)
        let offset = min(max(0, selectedMinX + card.width - visibleWidth), fullWidth - visibleWidth)

        let strip = NSView(frame: NSRect(x: Self.inset, y: Self.inset, width: visibleWidth, height: card.height))
        strip.wantsLayer = true
        strip.layer?.masksToBounds = true
        for (i, tab) in tabs.enumerated() {
            let view = TabCardView(
                tab: tab,
                preview: tab.hasPreview ? previews(tab.id) : nil,
                favicon: favicons.image(for: tab.favIconURL) { [weak self] in self?.redraw() },
                selected: i == index)
            view.frame.origin = NSPoint(x: CGFloat(i) * (card.width + Self.gap) - offset, y: 0)
            strip.addSubview(view)
        }

        let background = NSVisualEffectView(frame: NSRect(origin: .zero, size: size))
        background.material = .hudWindow
        background.blendingMode = .behindWindow
        background.state = .active
        background.wantsLayer = true
        background.layer?.cornerRadius = 16
        background.layer?.masksToBounds = true
        background.layer?.backgroundColor = NSColor(srgbRed: 28 / 255, green: 28 / 255, blue: 30 / 255, alpha: 0.92).cgColor
        background.addSubview(strip)
        panel.contentView = background

        let frame = screen.visibleFrame
        panel.setFrame(NSRect(x: frame.midX - size.width / 2, y: frame.midY - size.height / 2,
                              width: size.width, height: size.height), display: true)
        panel.orderFrontRegardless()
    }

    func close() {
        shown = nil
        panel?.orderOut(nil)
    }

    private func redraw() {
        guard let shown else { return }
        show(tabs: shown.tabs, index: shown.index, on: shown.screen)
    }

    private func makePanel() -> NSPanel {
        let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        panel.level = .popUpMenu
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient, .ignoresCycle]
        panel.appearance = NSAppearance(named: .darkAqua)
        return panel
    }
}

/// The screen showing Safari's frontmost window (window bounds need no Screen Recording permission).
@MainActor
func screenOfFrontSafariWindow() -> NSScreen {
    let fallback = NSScreen.main ?? NSScreen.screens[0]
    guard let safari = NSRunningApplication.runningApplications(withBundleIdentifier: SafariActivity.bundleIdentifier).first,
          let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
          let window = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? pid_t) == safari.processIdentifier && ($0[kCGWindowLayer as String] as? Int) == 0 }),
          let boundsDict = window[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: boundsDict)
    else { return fallback }
    // CG window bounds have a top-left origin on the primary screen; NSScreen frames a bottom-left one.
    let primaryHeight = NSScreen.screens[0].frame.height
    let center = NSPoint(x: bounds.midX, y: primaryHeight - bounds.midY)
    return NSScreen.screens.first { $0.frame.contains(center) } ?? fallback
}
