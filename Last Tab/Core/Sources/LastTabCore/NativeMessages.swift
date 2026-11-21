// Messages the extension's background sends through browser.runtime.sendNativeMessage
// (contract: src/shared/native.ts).
import Foundation

struct SnapshotTab: Codable, Equatable, Sendable {
    var id: Int
    var title: String
    var favIconUrl: String?
    var hasPreview: Bool
}

struct WindowTabs: Codable, Equatable, Sendable {
    /// Most recently used first.
    var tabs: [SnapshotTab]
}

struct Snapshot: Codable, Equatable, Sendable {
    var focusedWindowId: Int?
    var windows: [String: WindowTabs]

    /// Tabs of the focused window in MRU order, as the menu shows them.
    var focusedTabs: [MenuTab] {
        guard let id = focusedWindowId, let window = windows[String(id)] else { return [] }
        return window.tabs.map {
            MenuTab(id: $0.id, title: $0.title, favIconURL: $0.favIconUrl.flatMap(URL.init(string:)), hasPreview: $0.hasPreview)
        }
    }
}

struct Shortcuts: Codable, Equatable, Sendable {
    var forward: Combo
    /// Already resolved by the extension; nil when there is no reverse shortcut.
    var reverse: Combo?
}

enum NativeMessage: Equatable, Sendable {
    case snapshot(Snapshot)
    case preview(tabId: Int, jpeg: Data)
    case shortcuts(Shortcuts)
    case activated(tabId: Int)
    case ping

    struct DecodeError: Error {}

    /// Decodes the Foundation object Safari hands the extension handler.
    static func decode(_ object: Any?) throws -> NativeMessage {
        guard let object, JSONSerialization.isValidJSONObject(object) else { throw DecodeError() }
        let data = try JSONSerialization.data(withJSONObject: object)
        let decoder = JSONDecoder()
        struct Kind: Decodable { var type: String }
        switch try decoder.decode(Kind.self, from: data).type {
        case "snapshot":
            return .snapshot(try decoder.decode(Snapshot.self, from: data))
        case "preview":
            struct Preview: Decodable { var tabId: Int; var jpegBase64: String }
            let preview = try decoder.decode(Preview.self, from: data)
            guard let jpeg = Data(base64Encoded: preview.jpegBase64) else { throw DecodeError() }
            return .preview(tabId: preview.tabId, jpeg: jpeg)
        case "shortcuts":
            return .shortcuts(try decoder.decode(Shortcuts.self, from: data))
        case "activated":
            struct Activated: Decodable { var tabId: Int }
            return .activated(tabId: try decoder.decode(Activated.self, from: data).tabId)
        case "ping":
            return .ping
        default:
            throw DecodeError()
        }
    }
}
