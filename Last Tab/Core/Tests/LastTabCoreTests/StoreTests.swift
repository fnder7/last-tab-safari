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
    let url = try #require(store.previewURL(profile: "", tabId: 10))
    #expect(try Data(contentsOf: url) == jpeg)
    #expect(store.previewURL(profile: "", tabId: 99) == nil)
}

@Test func snapshotDeletesPreviewsOfClosedTabs() throws {
    let (store, _) = try tempStore()
    let b64 = Data([1, 2, 3]).base64EncodedString()
    _ = try store.apply(message(#"{ "type": "preview", "tabId": 10, "jpegBase64": "\#(b64)" }"#))
    _ = try store.apply(message(#"{ "type": "preview", "tabId": 30, "jpegBase64": "\#(b64)" }"#))
    _ = try store.apply(message(snapshotJSON)) // has 10 and 20, not 30
    #expect(store.previewURL(profile: "", tabId: 10) != nil)
    #expect(store.previewURL(profile: "", tabId: 30) == nil)
}

private func profileSnapshot(_ profile: String, focusedAt: Double, ids: [Int]) -> String {
    let tabs = ids.map { #"{ "id": \#($0), "title": "T", "favIconUrl": null, "hasPreview": true }"# }.joined(separator: ",")
    return #"{ "type": "snapshot", "profile": "\#(profile)", "focusedAt": \#(focusedAt), "focusedWindowId": 1, "windows": { "1": { "tabs": [\#(tabs)] } } }"#
}

private func profilePreview(_ profile: String, _ tabId: Int) -> String {
    #"{ "type": "preview", "profile": "\#(profile)", "tabId": \#(tabId), "jpegBase64": "AQID" }"#
}

@Test func profilesKeepTheirOwnPreviews() throws {
    let (store, _) = try tempStore()
    _ = try store.apply(message(profilePreview("p1", 10)))
    _ = try store.apply(message(profilePreview("p2", 50)))
    _ = try store.apply(message(profileSnapshot("p1", focusedAt: 1, ids: [10])))
    _ = try store.apply(message(profileSnapshot("p2", focusedAt: 2, ids: [50])))
    #expect(store.previewURL(profile: "p1", tabId: 10) != nil)
    #expect(store.previewURL(profile: "p2", tabId: 50) != nil)
    #expect(store.previewURL(profile: "p1", tabId: 50) == nil)
}

@Test func snapshotOfTheLastFocusedProfileWins() throws {
    let (store, _) = try tempStore()
    _ = try store.apply(message(profileSnapshot("p1", focusedAt: 200, ids: [10])))
    _ = try store.apply(message(profileSnapshot("p2", focusedAt: 100, ids: [50]))) // written later, focused earlier
    #expect(store.snapshot()?.profile == "p1")
    #expect(store.snapshot()?.focusedTabs.map(\.id) == [10])
    _ = try store.apply(message(profileSnapshot("p2", focusedAt: 300, ids: [50])))
    #expect(store.snapshot()?.profile == "p2")
}

@Test func profileIdIsMadeSafeForFileNames() {
    #expect(Store.folder("1b4e28ba-2fa1-11d2-883f-0016d3cca427") == "1b4e28ba-2fa1-11d2-883f-0016d3cca427")
    #expect(Store.folder("../../etc") == "etc")
    #expect(Store.folder("") == "default")
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
    #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("states").path))
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

@Test func accessRoundTrip() throws {
    let (store, _) = try tempStore()
    #expect(store.allSitesAccess() == nil)
    #expect(try store.apply(message(#"{ "type": "access", "allSites": false }"#)) == nil)
    #expect(store.allSitesAccess() == false)
    _ = try store.apply(message(#"{ "type": "access", "allSites": true }"#))
    #expect(store.allSitesAccess() == true)
    store.clearAll()
    #expect(store.allSitesAccess() == true) // survives Safari quitting, unlike tab state
}
