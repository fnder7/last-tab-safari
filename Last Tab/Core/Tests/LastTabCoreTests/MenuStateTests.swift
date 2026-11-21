// Port of tests/menu-state.test.ts, case for case.
import Testing
@testable import LastTabCore

private func card(_ id: Int) -> MenuTab { MenuTab(id: id, title: "T\(id)", favIconURL: nil, hasPreview: false) }
private let T = [card(1), card(2), card(3)]
private let fwd = MenuAction.press(reverse: false)
private let rev = MenuAction.press(reverse: true)
private func loaded(_ tabs: [MenuTab] = T) -> MenuAction { .listLoaded(tabs) }

private func run(_ actions: [MenuAction], from: MenuState = .closed) -> (state: MenuState, effects: [MenuEffect]) {
    var state = from
    var effects: [MenuEffect] = []
    for action in actions {
        let result = reduce(state, action)
        state = result.0
        effects += result.1
    }
    return (state, effects)
}

private func lastRenderIndex(_ effects: [MenuEffect]) -> Int? {
    for effect in effects.reversed() { if case let .render(_, index) = effect { return index } }
    return nil
}

private func activates(_ effects: [MenuEffect]) -> Bool {
    effects.contains { if case .activate = $0 { return true } else { return false } }
}

@Test func pressOpensLoadingAndRequestsList() {
    let (state, effects) = run([fwd])
    #expect(state.phase == .loading)
    #expect(effects == [.requestList])
}

@Test func listLoadedOpensWithIndex1() {
    let (state, effects) = run([fwd, loaded()])
    #expect(state.phase == .open)
    #expect(effects.last == .render(T, index: 1))
}

@Test func reversePressOpensOnLast() {
    #expect(lastRenderIndex(run([rev, loaded()]).effects) == 2)
}

@Test func pressWhileOpenStepsForwardAndWraps() {
    #expect(lastRenderIndex(run([fwd, loaded(), fwd]).effects) == 2)
    #expect(lastRenderIndex(run([fwd, loaded(), fwd, fwd]).effects) == 0)
}

@Test func reverseStepsBackAndWraps() {
    #expect(lastRenderIndex(run([fwd, loaded(), rev]).effects) == 0)
    #expect(lastRenderIndex(run([fwd, loaded(), rev, rev]).effects) == 2)
}

@Test func arrowsStep() {
    #expect(lastRenderIndex(run([fwd, loaded(), .arrow(right: true)]).effects) == 2)
    #expect(lastRenderIndex(run([fwd, loaded(), .arrow(right: false)]).effects) == 0)
}

@Test func releaseActivatesSelection() {
    let (state, effects) = run([fwd, loaded(), fwd, .release])
    #expect(state.phase == .closed)
    #expect(Array(effects.suffix(2)) == [.close, .activate(tabId: 3)])
}

@Test func releaseOnCurrentTabDoesNotActivate() {
    let (_, effects) = run([fwd, loaded(), fwd, fwd, .release])
    #expect(effects.last == .close)
    #expect(!activates(effects))
}

@Test func escapeClosesWithoutActivate() {
    let (state, effects) = run([fwd, loaded(), .escape])
    #expect(state.phase == .closed)
    #expect(effects.last == .close)
    #expect(!activates(effects))
}

@Test func blurClosesWithoutActivate() {
    let (state, effects) = run([fwd, loaded(), .blur])
    #expect(state.phase == .closed)
    #expect(!activates(effects))
}

@Test func blurWhileLoadingDropsThePendingPress() {
    let (state, effects) = run([fwd, .blur, loaded()])
    #expect(state.phase == .closed)
    #expect(effects == [.requestList])
}

@Test func quickTapSwitchesWithoutRendering() {
    let (state, effects) = run([fwd, .release, loaded()])
    #expect(state.phase == .closed)
    #expect(effects == [.requestList, .activate(tabId: 2)])
}

@Test func pressesDuringLoadingAddSteps() {
    #expect(lastRenderIndex(run([fwd, fwd, loaded()]).effects) == 2)
}

@Test func singleTabNeverOpens() {
    let (state, effects) = run([fwd, loaded([card(1)])])
    #expect(state.phase == .closed)
    #expect(effects == [.requestList])
}

@Test func ignoredActionsReturnSameState() {
    let closed = reduce(.closed, .release)
    #expect(closed.0 == .closed)
    #expect(closed.1.isEmpty)
    let open = run([fwd, loaded()]).state
    let stale = reduce(open, loaded())
    #expect(stale.0 == open)
    #expect(stale.1.isEmpty)
}

@Test func twoQuickTapsBeforeTheListArriveGoThereAndBack() {
    let (state, effects) = run([fwd, .release, fwd, .release, loaded()])
    #expect(state.phase == .closed)
    #expect(effects == [.requestList])
}

@Test func quickTapThenAHoldOpensFromTheNewCurrentTab() {
    let (state, effects) = run([fwd, .release, fwd, loaded()])
    #expect(state.phase == .open)
    guard case let .render(tabs, index)? = effects.last else { Issue.record("no render"); return }
    #expect(tabs.map(\.id) == [2, 1, 3])
    #expect(index == 1)
}

@Test func tapThenHoldEndingOnTheOriginalTabDoesNotSwitch() {
    let (_, effects) = run([fwd, .release, fwd, loaded(), .release])
    #expect(effects.last == .close)
    #expect(!activates(effects))
}

@Test func tapThenHoldSteppingFurtherSwitchesToThatTab() {
    let (_, effects) = run([fwd, .release, fwd, loaded(), fwd, .release])
    #expect(Array(effects.suffix(2)) == [.close, .activate(tabId: 3)])
}

@Test func releasesWhenAnyNonShiftModifierOfTheOpenerIsUp() {
    let opener = Combo(code: "KeyE", alt: true, ctrl: true)
    #expect(isReleased(held: Combo(code: "", alt: true), opener: opener))
    #expect(!isReleased(held: Combo(code: "", alt: true, ctrl: true, shift: true), opener: opener))
    #expect(!isReleased(held: Combo(code: "", alt: true, ctrl: true), opener: opener))
    #expect(!isReleased(held: Combo(code: "", meta: true, alt: true, ctrl: true), opener: opener))
}
