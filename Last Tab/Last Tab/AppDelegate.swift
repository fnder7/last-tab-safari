// Last Tab lives in the menu bar: it owns the shortcuts while Safari is active and shows the
// tab strip. Tab data comes from the extension through the App Group (see Core/Store.swift).
import Cocoa
import SafariServices
import os

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    private let logger = Logger(subsystem: "dev.fnder77.LastTab", category: "app")
    private var store: Store?
    private var hotKeys: HotKeyCenter!
    private var safari: SafariActivity!
    private var notifications: DarwinNotifications!
    private var statusMenu: StatusMenu!
    private var switcher: SwitcherController!
    private var setupWindow: NSWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        store = Store.appGroupDirectory().map(Store.init(directory:))
        hotKeys = HotKeyCenter()
        safari = SafariActivity()
        notifications = DarwinNotifications()
        statusMenu = StatusMenu()
        statusMenu.onShowSetup = { [weak self] in self?.showSetup() }
        switcher = SwitcherController(store: store, hotKeys: hotKeys)

        safari.onChange = { [weak self] active in
            if !active { self?.switcher.blur() }
            self?.registerShortcuts()
        }
        safari.onQuit = { [weak self] in self?.store?.clearAll() }
        notifications.observe(.shortcuts) { [weak self] in self?.registerShortcuts() }
        notifications.observe(.state) { [weak self] in self?.switcher.snapshotChanged() }
        notifications.observe(.activated) { [weak self] in self?.switcher.acknowledged() }
        registerShortcuts()

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, _ in
            DispatchQueue.main.async { [weak self] in
                if state?.isEnabled != true { self?.showSetup() }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    /// lasttab:// — opened from the extension popup when the app wasn't running.
    /// lasttab://setup opens the setup checklist.
    func application(_ application: NSApplication, open urls: [URL]) {
        if urls.contains(where: { $0.host == "setup" }) { showSetup() }
    }

    private func registerShortcuts() {
        let shortcuts = store?.shortcuts()
        statusMenu.show(shortcuts)
        guard safari.isActive, let shortcuts else {
            hotKeys.unregister(.forward)
            hotKeys.unregister(.reverse)
            logger.info("shortcuts off (safari active: \(self.safari.isActive))")
            return
        }
        logger.info("shortcuts on: \(shortcuts.forward.label, privacy: .public) / \(shortcuts.reverse?.label ?? "-", privacy: .public)")
        hotKeys.register(.forward, shortcuts.forward) { [weak self] in
            self?.switcher.press(reverse: false, combo: shortcuts.forward)
        }
        if let reverse = shortcuts.reverse {
            hotKeys.register(.reverse, reverse) { [weak self] in self?.switcher.press(reverse: true, combo: reverse) }
        } else {
            hotKeys.unregister(.reverse)
        }
    }

    private func showSetup() {
        if setupWindow == nil {
            setupWindow = NSStoryboard(name: "Main", bundle: nil).instantiateController(withIdentifier: "SetupWindow") as? NSWindowController
        }
        NSApp.activate()
        setupWindow?.showWindow(nil)
    }
}
