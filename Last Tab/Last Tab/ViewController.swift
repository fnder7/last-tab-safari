// The setup window: a checklist (extension on, every website, open at login) that ticks itself off
// while the user works through it in Safari. Website access is reported by the extension (access.json). The page lives in Resources/Base.lproj/Main.html.
import Cocoa
import SafariServices
import ServiceManagement
import WebKit

let extensionBundleIdentifier = "dev.fnder77.LastTab.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!
    private var timer: Timer?
    private var pageLoaded = false
    private lazy var store = Store.appGroupDirectory().map(Store.init(directory:))

    private struct State: Encodable {
        var extensionEnabled: Bool?
        var extensionFound: Bool
        var allSites: Bool?
        var loginEnabled: Bool
        var shortcut: String
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")
        webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!,
                            allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    // Poll only while the window is on screen: Safari doesn't notify us when the extension is toggled.
    override func viewDidAppear() {
        super.viewDidAppear()
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        }
    }

    override func viewDidDisappear() {
        super.viewDidDisappear()
        timer?.invalidate()
        timer = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        refresh()
    }

    private func refresh() {
        guard pageLoaded else { return }
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, error in
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                let current = State(
                    extensionEnabled: state?.isEnabled,
                    extensionFound: error == nil,
                    allSites: self.store?.allSitesAccess(),
                    loginEnabled: SMAppService.mainApp.status == .enabled,
                    shortcut: self.store?.shortcuts()?.forward.label ?? "⌥Q")
                guard let data = try? JSONEncoder().encode(current),
                      let json = String(data: data, encoding: .utf8) else { return }
                self.webView.evaluateJavaScript("update(\(json))")
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.body as? String {
        case "open-preferences":
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
        case "toggle-login":
            do {
                if SMAppService.mainApp.status == .enabled {
                    try SMAppService.mainApp.unregister()
                } else {
                    try SMAppService.mainApp.register()
                }
            } catch {
                NSAlert(error: error).runModal()
            }
            refresh()
        case "close":
            view.window?.close()
        default:
            break
        }
    }
}
