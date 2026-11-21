// System-wide shortcuts through Carbon's RegisterEventHotKey: works in the sandbox and
// needs no Accessibility permission. Keys go by physical key code, so any layout works.
import Carbon.HIToolbox
import os

struct HotKeyID: Hashable {
    let rawValue: UInt32
    static let forward = HotKeyID(rawValue: 1)
    static let reverse = HotKeyID(rawValue: 2)
    /// Temporary navigation keys while the strip is open.
    static func nav(_ index: Int) -> HotKeyID { HotKeyID(rawValue: 100 + UInt32(index)) }
}

@MainActor
final class HotKeyCenter {
    private static let signature = OSType(0x4C54_4142) // "LTAB"
    private let logger = Logger(subsystem: "dev.fnder77.LastTab", category: "hotkeys")
    private var refs: [HotKeyID: EventHotKeyRef] = [:]
    private var handlers: [HotKeyID: () -> Void] = [:]

    init() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let me = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, event, context in
            guard let event, let context else { return OSStatus(eventNotHandledErr) }
            var hotKey = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &hotKey)
            let center = Unmanaged<HotKeyCenter>.fromOpaque(context).takeUnretainedValue()
            MainActor.assumeIsolated { center.fire(hotKey.id) }
            return noErr
        }, 1, &spec, me, nil)
    }

    /// Registers `combo` under `id`, replacing what was there. Invalid combos are skipped.
    func register(_ id: HotKeyID, _ combo: Combo?, handler: @escaping () -> Void) {
        unregister(id)
        guard let combo, let keyCode = combo.carbonKeyCode else { return }
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(keyCode, combo.carbonModifiers, EventHotKeyID(signature: Self.signature, id: id.rawValue),
                                         GetApplicationEventTarget(), 0, &ref)
        guard status == noErr, let ref else {
            logger.error("RegisterEventHotKey \(combo.label, privacy: .public) failed: \(status)")
            return
        }
        refs[id] = ref
        handlers[id] = handler
    }

    func unregister(_ id: HotKeyID) {
        if let ref = refs.removeValue(forKey: id) { UnregisterEventHotKey(ref) }
        handlers[id] = nil
    }

    func unregister(where matches: (HotKeyID) -> Bool) {
        refs.keys.filter(matches).forEach(unregister)
    }

    private func fire(_ rawId: UInt32) {
        handlers[HotKeyID(rawValue: rawId)]?()
    }
}
