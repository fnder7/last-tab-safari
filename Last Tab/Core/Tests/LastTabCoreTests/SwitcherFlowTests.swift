import Testing
@testable import LastTabCore

private let opener = Combo(code: "KeyE", alt: true)

private func snapshot(_ ids: [Int], window: Int = 1) -> Snapshot {
    Snapshot(focusedWindowId: window, windows: [String(window): WindowTabs(tabs: ids.map {
        SnapshotTab(id: $0, title: "T\($0)", favIconUrl: nil, hasPreview: false)
    })])
}

private func tabs(_ ids: [Int]) -> [MenuTab] { snapshot(ids).focusedTabs }

@Test func pressWithSnapshotOpensOnSecondTab() {
    var flow = SwitcherFlow()
    let commands = flow.press(reverse: false, opener: opener, snapshot: snapshot([1, 2, 3]))
    #expect(commands == [.registerNavKeys, .show(tabs([1, 2, 3]), index: 1), .startWatchingRelease(opener: opener)])
    #expect(flow.isOpen)
}

@Test func quickTapSwitchesToThePreviousTab() {
    var flow = SwitcherFlow()
    _ = flow.press(reverse: false, opener: opener, snapshot: snapshot([1, 2, 3]))
    let commands = flow.handle(.release)
    #expect(commands == [.close, .activate(tabId: 2), .unregisterNavKeys, .stopWatchingRelease])
    #expect(!flow.isOpen)
}

@Test func noSnapshotMeansNothingHappens() {
    var flow = SwitcherFlow()
    #expect(flow.press(reverse: false, opener: opener, snapshot: nil) == [])
    #expect(flow.press(reverse: false, opener: opener, snapshot: snapshot([1])) == [])
    #expect(!flow.isOpen)
}

@Test func pressesWhileOpenStepAndReleaseActivates() {
    var flow = SwitcherFlow()
    _ = flow.press(reverse: false, opener: opener, snapshot: snapshot([1, 2, 3]))
    #expect(flow.press(reverse: false, opener: opener, snapshot: snapshot([1, 2, 3])) == [.show(tabs([1, 2, 3]), index: 2)])
    #expect(flow.handle(.arrow(right: true)) == [.show(tabs([1, 2, 3]), index: 0)])
    #expect(flow.handle(.release) == [.close, .unregisterNavKeys, .stopWatchingRelease]) // back on the current tab
}

@Test func escapeAndBlurCloseWithoutSwitching() {
    for action in [MenuAction.escape, .blur] {
        var flow = SwitcherFlow()
        _ = flow.press(reverse: true, opener: opener, snapshot: snapshot([1, 2, 3]))
        #expect(flow.handle(action) == [.close, .unregisterNavKeys, .stopWatchingRelease])
    }
}

@Test func refreshesOpenStripOnStateNotification() {
    var flow = SwitcherFlow()
    _ = flow.press(reverse: false, opener: opener, snapshot: snapshot([1, 2, 3])) // selects 2
    #expect(flow.snapshotChanged(snapshot([1, 4, 2, 3])) == [.show(tabs([1, 4, 2, 3]), index: 2)])
    #expect(flow.handle(.release) == [.close, .activate(tabId: 2), .unregisterNavKeys, .stopWatchingRelease])
}

@Test func refreshKeepsAValidSelectionWhenTheSelectedTabCloses() {
    var flow = SwitcherFlow()
    _ = flow.press(reverse: true, opener: opener, snapshot: snapshot([1, 2, 3])) // selects 3
    #expect(flow.snapshotChanged(snapshot([1, 2])) == [.show(tabs([1, 2]), index: 1)])
}

@Test func refreshClosesWhenFewerThanTwoTabsRemain() {
    var flow = SwitcherFlow()
    _ = flow.press(reverse: false, opener: opener, snapshot: snapshot([1, 2]))
    #expect(flow.snapshotChanged(snapshot([1])) == [.close, .unregisterNavKeys, .stopWatchingRelease])
}

@Test func snapshotChangesWhileClosedDoNothing() {
    var flow = SwitcherFlow()
    #expect(flow.snapshotChanged(snapshot([1, 2])) == [])
}

@Test func navKeysRegisteredOnlyWhileOpen() {
    var flow = SwitcherFlow()
    #expect(flow.handle(.arrow(right: true)) == [])
    #expect(flow.handle(.escape) == [])
}

// --- final review fixes ---------------------------------------------------

/// Runs commands like SwitcherController, including a release watcher that fires at once
/// (modifiers already up when the hot key event is handled).
private struct Runner {
    var flow = SwitcherFlow()
    var navKeys = false
    var panelShown = false
    var activated: [Int] = []

    mutating func press(_ snapshot: Snapshot, releaseAtOnce: Bool) {
        run(flow.press(reverse: false, opener: opener, snapshot: snapshot), releaseAtOnce: releaseAtOnce)
    }

    mutating func run(_ commands: [SwitcherCommand], releaseAtOnce: Bool) {
        for command in commands {
            switch command {
            case .show: panelShown = true
            case .close: panelShown = false
            case let .activate(id): activated.append(id)
            case .registerNavKeys: navKeys = true
            case .unregisterNavKeys: navKeys = false
            case .startWatchingRelease: if releaseAtOnce { run(flow.handle(.release), releaseAtOnce: false) }
            case .stopWatchingRelease: break
            }
        }
    }
}

@Test func releaseDuringTheOpeningBatchLeavesNothingBehind() {
    var runner = Runner()
    runner.press(snapshot([1, 2, 3]), releaseAtOnce: true)
    #expect(!runner.flow.isOpen)
    #expect(!runner.navKeys)
    #expect(!runner.panelShown)
    #expect(runner.activated == [2])
}

@Test func refreshAfterAStaleOpeningUsesTheNewCurrentTab() {
    var flow = SwitcherFlow()
    _ = flow.press(reverse: false, opener: opener, snapshot: snapshot([1, 2, 3])) // stale: really on 2
    #expect(flow.snapshotChanged(snapshot([2, 1, 3])) == [.show(tabs([2, 1, 3]), index: 1)]) // previous tab again
    #expect(flow.handle(.release) == [.close, .activate(tabId: 1), .unregisterNavKeys, .stopWatchingRelease])
}

@Test func twoQuickTapsBeforeAnyRefreshGoThereAndBack() {
    var runner = Runner()
    runner.press(snapshot([1, 2, 3]), releaseAtOnce: true)
    runner.press(snapshot([1, 2, 3]), releaseAtOnce: true) // the extension hasn't reported the switch yet
    #expect(runner.activated == [2, 1])
}

@Test func optimisticOrderEndsWithTheNextRealSnapshot() {
    var runner = Runner()
    runner.press(snapshot([1, 2, 3]), releaseAtOnce: true) // → 2
    _ = runner.flow.snapshotChanged(snapshot([3, 1, 2])) // the user clicked tab 3 in Safari meanwhile
    runner.press(snapshot([3, 1, 2]), releaseAtOnce: true)
    #expect(runner.activated == [2, 1])
}

@Test func navKeysIncludeShiftedVariants() {
    let opener = Combo(code: "KeyE", meta: true, shift: true)
    let keys = SwitcherFlow.navKeys(opener: opener)
    let left = keys.filter { $0.action == .arrow(right: false) }.map(\.combo)
    #expect(left.contains(Combo(code: "ArrowLeft", meta: true)))
    #expect(left.contains(Combo(code: "ArrowLeft", meta: true, shift: true)))
    #expect(left.contains(Combo(code: "ArrowLeft")))
    #expect(keys.contains { $0.action == .escape && $0.combo == Combo(code: "Escape", meta: true, shift: true) })
    #expect(Set(keys.map(\.combo)).count == keys.count)
}
