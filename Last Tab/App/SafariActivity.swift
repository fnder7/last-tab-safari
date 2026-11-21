// Tells when Safari becomes or stops being the active app, and when it quits.
import AppKit

@MainActor
final class SafariActivity {
    static let bundleIdentifier = "com.apple.Safari"

    var onChange: (Bool) -> Void = { _ in }
    var onQuit: () -> Void = {}
    private(set) var isActive = NSWorkspace.shared.frontmostApplication?.bundleIdentifier == SafariActivity.bundleIdentifier
    private var observers: [NSObjectProtocol] = []

    init() {
        let center = NSWorkspace.shared.notificationCenter
        observers.append(center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            let active = app?.bundleIdentifier == SafariActivity.bundleIdentifier
            MainActor.assumeIsolated { self?.update(active) }
        })
        observers.append(center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            guard app?.bundleIdentifier == SafariActivity.bundleIdentifier else { return }
            MainActor.assumeIsolated {
                self?.update(false)
                self?.onQuit()
            }
        })
    }

    private func update(_ active: Bool) {
        guard active != isActive else { return }
        isActive = active
        onChange(active)
    }
}
