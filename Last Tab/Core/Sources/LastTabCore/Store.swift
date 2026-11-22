// Files the extension handler writes and the app reads, in the shared App Group cache.
// Every Safari profile runs its own extension background, so snapshots and previews are kept
// per profile: states/<profile>.json and previews/<profile>/<tabId>.jpg.
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
    private var statesURL: URL { directory.appendingPathComponent("states", isDirectory: true) }
    /// Where builds before profiles kept the one snapshot; only removed now.
    private var legacyStateURL: URL { directory.appendingPathComponent("state.json") }
    private var shortcutsURL: URL { directory.appendingPathComponent("shortcuts.json") }
    private var accessURL: URL { directory.appendingPathComponent("access.json") }
    private var previewsURL: URL { directory.appendingPathComponent("previews", isDirectory: true) }

    init(directory: URL) {
        self.directory = directory
    }

    /// Stores the message and returns the notification to post, if any.
    func apply(_ message: NativeMessage) throws -> StoreNotification? {
        switch message {
        case let .snapshot(snapshot):
            let folder = Self.folder(snapshot.profile)
            try write(JSONEncoder().encode(snapshot), to: statesURL.appendingPathComponent("\(folder).json"))
            deletePreviews(of: folder, keeping: Set(snapshot.windows.values.flatMap { $0.tabs.map(\.id) }))
            return .state
        case let .preview(profile, tabId, jpeg):
            try write(jpeg, to: previewURLFor(profile: profile, tabId: tabId))
            return .preview
        case let .shortcuts(shortcuts):
            try write(JSONEncoder().encode(shortcuts), to: shortcutsURL)
            return .shortcuts
        case .activated:
            return .activated
        case let .access(allSites):
            // Read by the setup window, which polls while open: no notification needed.
            try write(JSONEncoder().encode(["allSites": allSites]), to: accessURL)
            return nil
        case .ping:
            return nil
        }
    }

    /// The snapshot of the profile whose window was focused last (the newest file on a tie).
    func snapshot() -> Snapshot? {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: statesURL, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        let candidates = files.filter { $0.pathExtension == "json" }.compactMap { url -> (Snapshot, Date)? in
            guard let snapshot = read(Snapshot.self, from: url) else { return nil }
            let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            return (snapshot, modified ?? .distantPast)
        }
        return candidates.max { a, b in (a.0.focusedAt, a.1) < (b.0.focusedAt, b.1) }?.0
    }

    func shortcuts() -> Shortcuts? { read(Shortcuts.self, from: shortcutsURL) }

    /// Whether the extension may run on every website; nil until the extension has reported it.
    func allSitesAccess() -> Bool? { read([String: Bool].self, from: accessURL)?["allSites"] }

    func previewURL(profile: String, tabId: Int) -> URL? {
        let url = previewURLFor(profile: profile, tabId: tabId)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func clearAll() {
        try? FileManager.default.removeItem(at: legacyStateURL)
        try? FileManager.default.removeItem(at: statesURL)
        try? FileManager.default.removeItem(at: previewsURL)
    }

    /// A file name for the profile id (the extension makes a UUID; anything else is filtered).
    static func folder(_ profile: String) -> String {
        let safe = String(profile.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || $0 == "-" }.map(Character.init))
        return safe.isEmpty ? "default" : safe
    }

    private func previewURLFor(profile: String, tabId: Int) -> URL {
        previewsURL.appendingPathComponent(Self.folder(profile), isDirectory: true).appendingPathComponent("\(tabId).jpg")
    }

    private func write(_ data: Data, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }

    private func read<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    /// Only this profile's previews: the other profiles' tabs are not in its snapshot.
    private func deletePreviews(of folder: String, keeping ids: Set<Int>) {
        let dir = previewsURL.appendingPathComponent(folder, isDirectory: true)
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        for file in files where !ids.contains(Int(file.deletingPathExtension().lastPathComponent) ?? -1) {
            try? FileManager.default.removeItem(at: file)
        }
    }
}
