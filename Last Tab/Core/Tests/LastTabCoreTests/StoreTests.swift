import Foundation
import Testing
@testable import LastTabCore

private func tempStore() throws -> (Store, URL) {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("lt-store-\(UUID().uuidString)")
    return (Store(directory: dir), dir)
}

private func message(_ json: String) throws -> NativeMessage {
    try NativeMessage.decode(JSONSerialization.jsonObject(with: Data(json.utf8)))
}

private let snapshotJSON = #"""
{ "type": "snapshot", "focusedWindowId": 1,
  "windows": { "1": { "tabs": [
    { "id": 10, "title": "A", "favIconUrl": "https://a.test/f.ico", "hasPreview": true },
    { "id": 20, "title": "B", "favIconUrl": null, "hasPreview": false } ] } } }
"""#

@Test func snapshotRoundTrip() throws {
    let (store, _) = try tempStore()
    _ = try store.apply(message(snapshotJSON))
    let snapshot = try #require(store.snapshot())
    #expect(snapshot.focusedWindowId == 1)
    #expect(snapshot.focusedTabs == [
        MenuTab(id: 10, title: "A", favIconURL: URL(string: "https://a.test/f.ico"), hasPreview: true),
        MenuTab(id: 20, title: "B", favIconURL: nil, hasPreview: false),
    ])
}

@Test func previewWrittenAsJPEG() throws {
    let (store, _) = try tempStore()
    let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0])
    _ = try store.apply(message(#"{ "type": "preview", "tabId": 10, "jpegBase64": "\#(jpeg.base64EncodedString())" }"#))
    let url = try #require(store.previewURL(tabId: 10))
    #expect(try Data(contentsOf: url) == jpeg)
    #expect(store.previewURL(tabId: 99) == nil)
}

@Test func snapshotDeletesPreviewsOfClosedTabs() throws {
    let (store, _) = try tempStore()
    let b64 = Data([1, 2, 3]).base64EncodedString()
    _ = try store.apply(message(#"{ "type": "preview", "tabId": 10, "jpegBase64": "\#(b64)" }"#))
    _ = try store.apply(message(#"{ "type": "preview", "tabId": 30, "jpegBase64": "\#(b64)" }"#))
    _ = try store.apply(message(snapshotJSON)) // has 10 and 20, not 30
    #expect(store.previewURL(tabId: 10) != nil)
    #expect(store.previewURL(tabId: 30) == nil)
}

@Test func shortcutsRoundTrip() throws {
    let (store, _) = try tempStore()
    _ = try store.apply(message(#"""
    { "type": "shortcuts",
      "forward": { "code": "KeyE", "meta": false, "alt": true, "ctrl": false, "shift": false },
      "reverse": null }
    """#))
    let shortcuts = try #require(store.shortcuts())
    #expect(shortcuts.forward == Combo(code: "KeyE", alt: true))
    #expect(shortcuts.reverse == nil)
}

@Test func clearAllRemovesEverything() throws {
    let (store, dir) = try tempStore()
    _ = try store.apply(message(snapshotJSON))
    store.clearAll()
    #expect(store.snapshot() == nil)
    #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("state.json").path))
}

@Test func applyReturnsMatchingNotification() throws {
    let (store, _) = try tempStore()
    #expect(try store.apply(message(snapshotJSON)) == .state)
    #expect(try store.apply(message(#"{ "type": "preview", "tabId": 1, "jpegBase64": "AQ==" }"#)) == .preview)
    #expect(try store.apply(message(#"{ "type": "ping" }"#)) == nil)
    #expect(try store.apply(message(#"{ "type": "activated", "tabId": 5 }"#)) == .activated)
    #expect(StoreNotification.state.rawValue == "dev.fnder77.LastTab.state")
}

@Test func unknownMessageThrows() {
    #expect(throws: (any Error).self) { try message(#"{ "type": "nope" }"#) }
}
