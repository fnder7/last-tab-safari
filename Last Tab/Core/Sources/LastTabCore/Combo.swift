// Keyboard shortcut model shared with the extension (same JSON as src/shared/combo.ts).
import Carbon.HIToolbox

struct Combo: Codable, Hashable, Sendable {
    /// DOM `KeyboardEvent.code` of the key, e.g. "KeyE".
    var code: String
    var meta = false
    var alt = false
    var ctrl = false
    var shift = false

    /// A known key plus at least one of ⌘ ⌥ ⌃ (Shift alone would break typing).
    var isValid: Bool { carbonKeyCode != nil && (meta || alt || ctrl) }

    var carbonKeyCode: UInt32? { Combo.keys[code].map { UInt32($0.keyCode) } }

    var carbonModifiers: UInt32 {
        var flags = 0
        if meta { flags |= cmdKey }
        if alt { flags |= optionKey }
        if ctrl { flags |= controlKey }
        if shift { flags |= shiftKey }
        return UInt32(flags)
    }

    var withShift: Combo {
        var copy = self
        copy.shift = true
        return copy
    }

    /// "⌃ ⌥ ⇧ ⌘ E": modifiers in macOS menu order, then the key.
    var label: String {
        var parts: [String] = []
        if ctrl { parts.append("⌃") }
        if alt { parts.append("⌥") }
        if shift { parts.append("⇧") }
        if meta { parts.append("⌘") }
        parts.append(Combo.keys[code]?.label ?? code)
        return parts.joined(separator: " ")
    }

    /// The reverse shortcut in effect: the custom one, else forward + ⇧ (nil when forward already has ⇧).
    static func effectiveReverse(forward: Combo, reverse: Combo?) -> Combo? {
        if let reverse { return reverse }
        return forward.shift ? nil : forward.withShift
    }

    private static let keys: [String: (keyCode: Int, label: String)] = {
        var map: [String: (Int, String)] = [:]
        let letters: [(String, Int)] = [
            ("A", kVK_ANSI_A), ("B", kVK_ANSI_B), ("C", kVK_ANSI_C), ("D", kVK_ANSI_D), ("E", kVK_ANSI_E),
            ("F", kVK_ANSI_F), ("G", kVK_ANSI_G), ("H", kVK_ANSI_H), ("I", kVK_ANSI_I), ("J", kVK_ANSI_J),
            ("K", kVK_ANSI_K), ("L", kVK_ANSI_L), ("M", kVK_ANSI_M), ("N", kVK_ANSI_N), ("O", kVK_ANSI_O),
            ("P", kVK_ANSI_P), ("Q", kVK_ANSI_Q), ("R", kVK_ANSI_R), ("S", kVK_ANSI_S), ("T", kVK_ANSI_T),
            ("U", kVK_ANSI_U), ("V", kVK_ANSI_V), ("W", kVK_ANSI_W), ("X", kVK_ANSI_X), ("Y", kVK_ANSI_Y),
            ("Z", kVK_ANSI_Z),
        ]
        for (letter, keyCode) in letters { map["Key\(letter)"] = (keyCode, letter) }
        let digits = [kVK_ANSI_0, kVK_ANSI_1, kVK_ANSI_2, kVK_ANSI_3, kVK_ANSI_4,
                      kVK_ANSI_5, kVK_ANSI_6, kVK_ANSI_7, kVK_ANSI_8, kVK_ANSI_9]
        for (digit, keyCode) in digits.enumerated() { map["Digit\(digit)"] = (keyCode, "\(digit)") }
        let punctuation: [(String, Int, String)] = [
            ("Backquote", kVK_ANSI_Grave, "`"), ("Comma", kVK_ANSI_Comma, ","), ("Period", kVK_ANSI_Period, "."),
            ("Slash", kVK_ANSI_Slash, "/"), ("Semicolon", kVK_ANSI_Semicolon, ";"), ("Quote", kVK_ANSI_Quote, "'"),
            ("BracketLeft", kVK_ANSI_LeftBracket, "["), ("BracketRight", kVK_ANSI_RightBracket, "]"),
            ("Minus", kVK_ANSI_Minus, "-"), ("Equal", kVK_ANSI_Equal, "="), ("Backslash", kVK_ANSI_Backslash, "\\"),
            ("Space", kVK_Space, "Space"), ("Tab", kVK_Tab, "Tab"),
            // Only for the strip's temporary navigation keys; the extension never offers these.
            ("ArrowLeft", kVK_LeftArrow, "←"), ("ArrowRight", kVK_RightArrow, "→"), ("Escape", kVK_Escape, "Esc"),
        ]
        for (code, keyCode, label) in punctuation { map[code] = (keyCode, label) }
        let functionKeys = [kVK_F1, kVK_F2, kVK_F3, kVK_F4, kVK_F5, kVK_F6,
                            kVK_F7, kVK_F8, kVK_F9, kVK_F10, kVK_F11, kVK_F12]
        for (index, keyCode) in functionKeys.enumerated() { map["F\(index + 1)"] = (keyCode, "F\(index + 1)") }
        return map
    }()
}
