// Files the extension handler writes and the app reads, in the shared App Group cache.
import Foundation

enum StoreNotification: String, Sendable {
    case state = "dev.fnder77.LastTab.state"
    case shortcuts = "dev.fnder77.LastTab.shortcuts"
    case preview = "dev.fnder77.LastTab.preview"
    case activated = "dev.fnder77.LastTab.activated"
}

final class Store: @unchecked Sendable {
    static let appGroup = "2K54TT5K2K.dev.fnder77.LastTab"

    /// `Library/Caches/LastTab` inside the App Group container.
    static func appGroupDirectory() -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("Library/Caches/LastTab", isDirectory: true)
    }

    let directory: URL
    private var stateURL: URL { directory.appendingPathComponent("state.json") }
    private var shortcutsURL: URL { directory.appendingPathComponent("shortcuts.json") }
    private var previewsURL: URL { directory.appendingPathComponent("previews", isDirectory: true) }

    init(directory: URL) {
        self.directory = directory
    }

    /// Stores the message and returns the notification to post, if any.
    func apply(_ message: NativeMessage) throws -> StoreNotification? {
        switch message {
        case let .snapshot(snapshot):
            try write(JSONEncoder().encode(snapshot), to: stateURL)
            deletePreviews(keeping: Set(snapshot.windows.values.flatMap { $0.tabs.map(\.id) }))
            return .state
        case let .preview(tabId, jpeg):
            try write(jpeg, to: previewURLFor(tabId))
            return .preview
        case let .shortcuts(shortcuts):
            try write(JSONEncoder().encode(shortcuts), to: shortcutsURL)
            return .shortcuts
        case .activated:
            return .activated
        case .ping:
            return nil
        }
    }

    func snapshot() -> Snapshot? { read(Snapshot.self, from: stateURL) }

    func shortcuts() -> Shortcuts? { read(Shortcuts.self, from: shortcutsURL) }

    func previewURL(tabId: Int) -> URL? {
        let url = previewURLFor(tabId)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func clearAll() {
        try? FileManager.default.removeItem(at: stateURL)
        try? FileManager.default.removeItem(at: previewsURL)
    }

    private func previewURLFor(_ tabId: Int) -> URL { previewsURL.appendingPathComponent("\(tabId).jpg") }

    private func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }

    private func read<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private func deletePreviews(keeping ids: Set<Int>) {
        let files = (try? FileManager.default.contentsOfDirectory(at: previewsURL, includingPropertiesForKeys: nil)) ?? []
        for file in files where !ids.contains(Int(file.deletingPathExtension().lastPathComponent) ?? -1) {
            try? FileManager.default.removeItem(at: file)
        }
    }
}
