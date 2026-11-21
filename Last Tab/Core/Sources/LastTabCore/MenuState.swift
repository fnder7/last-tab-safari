// Cmd-Tab style menu state machine: a port of the extension's former src/content/menu-state.ts.
// No AppKit, no I/O.
import Foundation

struct MenuTab: Equatable, Sendable {
    var id: Int
    var title: String
    var favIconURL: URL?
    var hasPreview: Bool
}

enum MenuState: Equatable, Sendable {
    case closed
    /// Shortcut pressed, waiting for the tab list. `steps` counts net presses of the current hold
    /// (reverse = −1); `completed` holds the steps of earlier holds already released (quick taps).
    case loading(steps: Int, released: Bool, completed: [Int])
    /// `currentId` is the tab Safari is really on; selecting it means "stay".
    case open(tabs: [MenuTab], index: Int, currentId: Int)

    enum Phase { case closed, loading, open }

    var phase: Phase {
        switch self {
        case .closed: .closed
        case .loading: .loading
        case .open: .open
        }
    }
}

enum MenuAction: Equatable, Sendable {
    case press(reverse: Bool)
    case listLoaded([MenuTab])
    case arrow(right: Bool)
    case release
    case escape
    case blur
}

enum MenuEffect: Equatable, Sendable {
    case requestList
    case render([MenuTab], index: Int)
    case close
    case activate(tabId: Int)
}

private func mod(_ n: Int, _ m: Int) -> Int { ((n % m) + m) % m }

private func activateUnless(_ tab: MenuTab, _ currentId: Int) -> [MenuEffect] {
    tab.id == currentId ? [] : [.activate(tabId: tab.id)]
}

/// Replays quick taps that finished before the list arrived: each one moves its target to the front.
private func replay(_ tabs: [MenuTab], _ completed: [Int]) -> [MenuTab] {
    var order = tabs
    for steps in completed {
        let target = order[mod(steps, order.count)]
        order = [target] + order.filter { $0.id != target.id }
    }
    return order
}

func reduce(_ state: MenuState, _ action: MenuAction) -> (MenuState, [MenuEffect]) {
    let same = (state, [MenuEffect]())

    switch state {
    case .closed:
        guard case let .press(reverse) = action else { return same }
        return (.loading(steps: reverse ? -1 : 1, released: false, completed: []), [.requestList])

    case let .loading(steps, released, completed):
        switch action {
        case let .press(reverse):
            let delta = reverse ? -1 : 1
            if released {
                // A new hold after a quick tap: remember the tap and start counting again.
                return (.loading(steps: delta, released: false, completed: completed + [steps]), [])
            }
            return (.loading(steps: steps + delta, released: false, completed: completed), [])
        case .release:
            return (.loading(steps: steps, released: true, completed: completed), [])
        case .escape, .blur:
            return (.closed, [])
        case let .listLoaded(list):
            guard list.count >= 2 else { return (.closed, []) }
            let currentId = list[0].id
            let tabs = replay(list, completed)
            let index = mod(steps, tabs.count)
            if released { return (.closed, activateUnless(tabs[index], currentId)) }
            return (.open(tabs: tabs, index: index, currentId: currentId), [.render(tabs, index: index)])
        case .arrow:
            return same
        }

    case let .open(tabs, index, currentId):
        switch action {
        case let .press(reverse):
            let next = mod(index + (reverse ? -1 : 1), tabs.count)
            return (.open(tabs: tabs, index: next, currentId: currentId), [.render(tabs, index: next)])
        case let .arrow(right):
            let next = mod(index + (right ? 1 : -1), tabs.count)
            return (.open(tabs: tabs, index: next, currentId: currentId), [.render(tabs, index: next)])
        case .release:
            return (.closed, [.close] + activateUnless(tabs[index], currentId))
        case .escape, .blur:
            return (.closed, [.close])
        case .listLoaded:
            return same
        }
    }
}

/// True once any of ⌘ ⌥ ⌃ that the opening shortcut uses is no longer held (⇧ is ignored).
func isReleased(held: Combo, opener: Combo) -> Bool {
    (opener.meta && !held.meta) || (opener.alt && !held.alt) || (opener.ctrl && !held.ctrl)
}
