// Observes the Darwin notifications the extension handler posts after writing to the App Group.
import Foundation

@MainActor
final class DarwinNotifications {
    private var handlers: [String: () -> Void] = [:]

    func observe(_ notification: StoreNotification, _ handler: @escaping () -> Void) {
        handlers[notification.rawValue] = handler
        let me = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), me, { _, observer, name, _, _ in
            guard let observer, let name = name?.rawValue as String? else { return }
            let center = Unmanaged<DarwinNotifications>.fromOpaque(observer).takeUnretainedValue()
            DispatchQueue.main.async { MainActor.assumeIsolated { center.handlers[name]?() } }
        }, notification.rawValue as CFString, nil, .deliverImmediately)
    }
}
