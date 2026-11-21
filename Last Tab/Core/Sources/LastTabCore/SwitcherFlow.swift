// Glue between the shortcuts, the menu state machine and the tab snapshot. Turns key events into
// commands for the AppKit side (panel, hot keys, release watching, switching). No AppKit here.

enum SwitcherCommand: Equatable, Sendable {
    case show([MenuTab], index: Int)
    case close
    case activate(tabId: Int)
    case startWatchingRelease(opener: Combo)
    case stopWatchingRelease
    case registerNavKeys
    case unregisterNavKeys
}

/// A temporary hot key while the strip is open.
struct NavKey: Equatable, Sendable {
    var action: MenuAction
    var combo: Combo
}

struct SwitcherFlow {
    private(set) var state: MenuState = .closed

    /// The tab we asked Safari to switch to, shown first until a newer snapshot arrives. The extension
    /// needs a few hundred ms to report a switch, and quick taps in a row must not see the old order.
    private var optimistic: (tabId: Int, staleFirstId: Int)?
    /// First tab of the snapshot the current list came from (before the optimistic reorder).
    private var listFirstId: Int?

    var isOpen: Bool { state != .closed }

    /// A shortcut press. `opener` is the shortcut whose modifiers must stay held.
    mutating func press(reverse: Bool, opener: Combo, snapshot: Snapshot?) -> [SwitcherCommand] {
        let wasClosed = state == .closed
        var commands = step(.press(reverse: reverse), snapshot: snapshot)
        if wasClosed && isOpen {
            // Watching starts last: a release noticed right away must find everything else in place.
            commands.insert(.registerNavKeys, at: 0)
            commands.append(.startWatchingRelease(opener: opener))
        }
        return commands
    }

    /// Release, arrows, Escape, blur.
    mutating func handle(_ action: MenuAction) -> [SwitcherCommand] {
        step(action, snapshot: nil)
    }

    /// New tab data. While the strip is open it is redrawn: the selection keeps its position relative
    /// to the current tab when that changed (a stale opening), otherwise it stays on the same tab.
    mutating func snapshotChanged(_ snapshot: Snapshot?) -> [SwitcherCommand] {
        let fresh = tabs(of: snapshot)
        guard case let .open(tabs, index, currentId) = state else { return [] }
        guard fresh.count >= 2 else { return step(.escape, snapshot: nil) }
        let newIndex: Int
        if fresh[0].id != currentId {
            newIndex = min(index, fresh.count - 1)
        } else {
            let selectedId = tabs[index].id
            newIndex = fresh.firstIndex { $0.id == selectedId } ?? min(index, fresh.count - 1)
        }
        state = .open(tabs: fresh, index: newIndex, currentId: fresh[0].id)
        return [.show(fresh, index: newIndex)]
    }

    static func navKeys(opener: Combo) -> [NavKey] {
        let actions: [(MenuAction, String)] = [(.arrow(right: false), "ArrowLeft"), (.arrow(right: true), "ArrowRight"), (.escape, "Escape")]
        var keys: [NavKey] = []
        for (action, code) in actions {
            let held = Combo(code: code, meta: opener.meta, alt: opener.alt, ctrl: opener.ctrl)
            for combo in [held, held.withShift, Combo(code: code)] where !keys.contains(where: { $0.combo == combo }) {
                keys.append(NavKey(action: action, combo: combo))
            }
        }
        return keys
    }

    /// Focused-window tabs, with the optimistic switch applied while the snapshot predates it.
    private mutating func tabs(of snapshot: Snapshot?) -> [MenuTab] {
        var tabs = snapshot?.focusedTabs ?? []
        guard let first = tabs.first else { return tabs }
        listFirstId = first.id
        if let pending = optimistic {
            if first.id != pending.staleFirstId {
                optimistic = nil // a newer snapshot: it knows better
            } else if let i = tabs.firstIndex(where: { $0.id == pending.tabId }) {
                tabs.insert(tabs.remove(at: i), at: 0)
            }
        }
        return tabs
    }

    private mutating func step(_ action: MenuAction, snapshot: Snapshot?) -> [SwitcherCommand] {
        let wasOpen = isOpen
        var commands: [SwitcherCommand] = []
        var pending = [action]
        while !pending.isEmpty {
            let (next, effects) = reduce(state, pending.removeFirst())
            state = next
            for effect in effects {
                switch effect {
                case .requestList: pending.append(.listLoaded(tabs(of: snapshot))) // the snapshot is local: answer now
                case let .render(tabs, index): commands.append(.show(tabs, index: index))
                case .close: commands.append(.close)
                case let .activate(tabId):
                    commands.append(.activate(tabId: tabId))
                    if let stale = optimistic?.staleFirstId ?? listFirstId { optimistic = (tabId, stale) }
                }
            }
        }
        if wasOpen && !isOpen {
            if !commands.contains(.close) { commands.insert(.close, at: 0) }
            commands += [.unregisterNavKeys, .stopWatchingRelease]
        }
        return commands
    }
}
