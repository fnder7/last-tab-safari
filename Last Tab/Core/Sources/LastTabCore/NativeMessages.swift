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
    /// The Safari profile that sent it; each profile runs its own extension background.
    /// Empty from extension builds that predate profiles.
    var profile: String = ""
    /// When a window of that profile last got focus (ms since epoch).
    var focusedAt: Double = 0

    /// Tabs of the focused window in MRU order, as the menu shows them.
    var focusedTabs: [MenuTab] {
        guard let id = focusedWindowId, let window = windows[String(id)] else { return [] }
        return window.tabs.map {
            MenuTab(id: $0.id, title: $0.title, favIconURL: $0.favIconUrl.flatMap(URL.init(string:)), hasPreview: $0.hasPreview)
        }
    }
}

extension Snapshot {
    private enum CodingKeys: String, CodingKey { case focusedWindowId, windows, profile, focusedAt }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        focusedWindowId = try c.decodeIfPresent(Int.self, forKey: .focusedWindowId)
        windows = try c.decode([String: WindowTabs].self, forKey: .windows)
        profile = try c.decodeIfPresent(String.self, forKey: .profile) ?? ""
        focusedAt = try c.decodeIfPresent(Double.self, forKey: .focusedAt) ?? 0
    }
}

struct Shortcuts: Codable, Equatable, Sendable {
    var forward: Combo
    /// Already resolved by the extension; nil when there is no reverse shortcut.
    var reverse: Combo?
}

enum NativeMessage: Equatable, Sendable {
    case snapshot(Snapshot)
    case preview(profile: String, tabId: Int, jpeg: Data)
    case shortcuts(Shortcuts)
    case activated(tabId: Int)
    /// Whether Safari lets the extension run on every website.
    case access(allSites: Bool)
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
            struct Preview: Decodable { var profile: String?; var tabId: Int; var jpegBase64: String }
            let preview = try decoder.decode(Preview.self, from: data)
            guard let jpeg = Data(base64Encoded: preview.jpegBase64) else { throw DecodeError() }
            return .preview(profile: preview.profile ?? "", tabId: preview.tabId, jpeg: jpeg)
        case "shortcuts":
            return .shortcuts(try decoder.decode(Shortcuts.self, from: data))
        case "activated":
            struct Activated: Decodable { var tabId: Int }
            return .activated(tabId: try decoder.decode(Activated.self, from: data).tabId)
        case "access":
            struct Access: Decodable { var allSites: Bool }
            return .access(allSites: try decoder.decode(Access.self, from: data).allSites)
        case "ping":
            return .ping
        default:
            throw DecodeError()
        }
    }
}
