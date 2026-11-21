// Receives the background's browser.runtime.sendNativeMessage calls, stores them in the
// App Group for the Last Tab app and pings the app with a Darwin notification.
import AppKit
import SafariServices
import os

private let logger = Logger(subsystem: "dev.fnder77.LastTab", category: "appex")

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey]

        var ok = false
        do {
            guard let directory = Store.appGroupDirectory() else { throw NativeMessage.DecodeError() }
            let decoded = try NativeMessage.decode(message)
            if case let .access(allSites) = decoded {
                logger.notice("website access: \(allSites ? "every website" : "limited", privacy: .public)")
            }
            if let notification = try Store(directory: directory).apply(decoded) {
                CFNotificationCenterPostNotification(
                    CFNotificationCenterGetDarwinNotifyCenter(),
                    CFNotificationName(notification.rawValue as CFString), nil, nil, true)
            }
            ok = true
        } catch {
            logger.error("Unhandled message: \(String(describing: error), privacy: .public)")
        }

        let appRunning = !NSRunningApplication.runningApplications(withBundleIdentifier: "dev.fnder77.LastTab").isEmpty
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["ok": ok, "appRunning": appRunning]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
