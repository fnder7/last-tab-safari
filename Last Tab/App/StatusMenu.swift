// The menu bar item: shows the current shortcuts (they are changed in the extension's popup).
import AppKit
import SafariServices
import ServiceManagement

@MainActor
final class StatusMenu: NSObject, NSMenuDelegate {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let forwardItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let reverseItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "Open at Login", action: #selector(toggleLogin), keyEquivalent: "")
    var onShowSetup: () -> Void = {}

    override init() {
        super.init()
        item.button?.image = NSImage(systemSymbolName: "square.stack", accessibilityDescription: "Last Tab")
        let menu = NSMenu()
        menu.delegate = self
        forwardItem.isEnabled = false
        reverseItem.isEnabled = false
        menu.addItem(forwardItem)
        menu.addItem(reverseItem)
        menu.addItem(.separator())
        loginItem.target = self
        menu.addItem(loginItem)
        let settings = NSMenuItem(title: "Last Tab Extension Settings…", action: #selector(openSettings), keyEquivalent: "")
        settings.target = self
        menu.addItem(settings)
        let setup = NSMenuItem(title: "Setup Instructions…", action: #selector(showSetup), keyEquivalent: "")
        setup.target = self
        menu.addItem(setup)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit Last Tab", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        item.menu = menu
        show(nil)
    }

    func show(_ shortcuts: Shortcuts?) {
        forwardItem.title = "Forward: " + (shortcuts.map { $0.forward.label } ?? "set in the Last Tab popup in Safari")
        reverseItem.title = "Back: " + (shortcuts?.reverse?.label ?? "—")
        reverseItem.isHidden = shortcuts == nil
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    @objc private func openSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
    }

    @objc private func showSetup() {
        onShowSetup()
    }
}
