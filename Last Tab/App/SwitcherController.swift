// Runs SwitcherFlow's commands: the panel, temporary navigation keys, release watching, and
// asking the extension to switch tabs (with one retry when it doesn't confirm).
import AppKit
import SafariServices
import os

@MainActor
final class SwitcherController {
    /// Like Cmd-Tab: a quick tap switches without the strip flashing up.
    private static let showDelay: TimeInterval = 0.12
    private static let ackTimeout: TimeInterval = 0.3

    private let logger = Logger(subsystem: "dev.fnder77.LastTab", category: "switcher")
    private let store: Store?
    private let hotKeys: HotKeyCenter
    private let watcher = ModifierWatcher()
    private let panel: SwitcherPanel
    private var flow = SwitcherFlow()
    private var opener: Combo?
    private var pendingShow: (tabs: [MenuTab], index: Int)?
    private var showTimer: Timer?
    private var panelVisible = false
    private var awaitingAck: (tabId: Int, retried: Bool)?
    /// Profile of the snapshot the strip shows: previews and switches belong to it.
    private final class Profile { var id = "" }
    private let profile = Profile()
    private var ackTimer: Timer?

    init(store: Store?, hotKeys: HotKeyCenter) {
        self.store = store
        self.hotKeys = hotKeys
        panel = SwitcherPanel { [profile] tabId in
            store?.previewURL(profile: profile.id, tabId: tabId).flatMap(NSImage.init(contentsOf:))
        }
    }

    func press(reverse: Bool, combo: Combo) {
        if !flow.isOpen { opener = combo }
        run(flow.press(reverse: reverse, opener: combo, snapshot: loadSnapshot()))
    }

    /// Safari stopped being the active app.
    func blur() { handle(.blur) }

    func snapshotChanged() { run(flow.snapshotChanged(loadSnapshot())) }

    private func loadSnapshot() -> Snapshot? {
        let snapshot = store?.snapshot()
        if let snapshot { profile.id = snapshot.profile }
        return snapshot
    }

    /// The extension confirmed a switch.
    func acknowledged() {
        ackTimer?.invalidate()
        awaitingAck = nil
    }

    private func handle(_ action: MenuAction) { run(flow.handle(action)) }

    private func run(_ commands: [SwitcherCommand]) {
        for command in commands {
            switch command {
            case let .show(tabs, index): show(tabs, index)
            case .close: closePanel()
            case let .activate(tabId): activate(tabId, retried: false)
            case let .startWatchingRelease(opener):
                watcher.start(opener: opener) { [weak self] in self?.handle(.release) }
            case .stopWatchingRelease: watcher.stop()
            case .registerNavKeys: registerNavKeys()
            case .unregisterNavKeys:
                hotKeys.unregister { $0.rawValue >= HotKeyID.nav(0).rawValue }
            }
        }
    }

    private func show(_ tabs: [MenuTab], _ index: Int) {
        if panelVisible {
            panel.show(tabs: tabs, index: index, on: screenOfFrontSafariWindow())
            return
        }
        pendingShow = (tabs, index)
        guard showTimer == nil else { return }
        showTimer = Timer.scheduledTimer(withTimeInterval: Self.showDelay, repeats: false) { _ in
            MainActor.assumeIsolated { [weak self] in
                guard let self, let pending = self.pendingShow else { return }
                self.showTimer = nil
                self.pendingShow = nil
                self.panelVisible = true
                self.panel.show(tabs: pending.tabs, index: pending.index, on: screenOfFrontSafariWindow())
            }
        }
    }

    private func closePanel() {
        showTimer?.invalidate()
        showTimer = nil
        pendingShow = nil
        panelVisible = false
        panel.close()
    }

    private func registerNavKeys() {
        for (index, key) in SwitcherFlow.navKeys(opener: opener ?? Combo(code: "")).enumerated() {
            hotKeys.register(.nav(index), key.combo) { [weak self] in self?.handle(key.action) }
        }
    }

    private func activate(_ tabId: Int, retried: Bool) {
        awaitingAck = (tabId, retried)
        SFSafariApplication.dispatchMessage(withName: "activate", toExtensionWithIdentifier: extensionBundleIdentifier,
                                            userInfo: ["tabId": tabId, "profile": profile.id]) { [logger] error in
            if let error { logger.error("dispatchMessage failed: \(error.localizedDescription, privacy: .public)") }
        }
        ackTimer?.invalidate()
        ackTimer = Timer.scheduledTimer(withTimeInterval: Self.ackTimeout, repeats: false) { _ in
            MainActor.assumeIsolated { [weak self] in
                guard let self, let waiting = self.awaitingAck, waiting.tabId == tabId else { return }
                if waiting.retried {
                    self.logger.error("tab \(tabId) not confirmed after a retry")
                    self.awaitingAck = nil
                } else {
                    self.activate(tabId, retried: true)
                }
            }
        }
    }
}
