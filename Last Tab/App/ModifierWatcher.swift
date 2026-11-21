// Notices when the shortcut's modifiers are let go by polling the global modifier state
// (no Accessibility permission needed, unlike event monitors).
import AppKit

@MainActor
final class ModifierWatcher {
    private var timer: Timer?

    /// Calls `released` once any of ⌘ ⌥ ⌃ that `opener` uses is up, then stops.
    func start(opener: Combo, released: @escaping () -> Void) {
        stop()
        let check = { [weak self] in
            let flags = CGEventSource.flagsState(.combinedSessionState)
            let held = Combo(code: "", meta: flags.contains(.maskCommand), alt: flags.contains(.maskAlternate),
                             ctrl: flags.contains(.maskControl), shift: flags.contains(.maskShift))
            guard isReleased(held: held, opener: opener) else { return }
            self?.stop()
            released()
        }
        timer = Timer.scheduledTimer(withTimeInterval: 0.008, repeats: true) { _ in
            MainActor.assumeIsolated { check() }
        }
        check()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }
}
