import Foundation
import Testing
@testable import LastTabCore

private func combo(_ code: String, meta: Bool = false, alt: Bool = false, ctrl: Bool = false, shift: Bool = false) -> Combo {
    Combo(code: code, meta: meta, alt: alt, ctrl: ctrl, shift: shift)
}

@Test func validRequiresNonShiftModifier() {
    #expect(!combo("KeyE", shift: true).isValid)
    #expect(!combo("KeyE").isValid)
    #expect(combo("KeyE", alt: true).isValid)
    #expect(combo("KeyE", meta: true, shift: true).isValid)
    #expect(!combo("Unknown", alt: true).isValid)
}

@Test func keyCodes() {
    #expect(combo("KeyE", alt: true).carbonKeyCode == 14)
    #expect(combo("Digit1", alt: true).carbonKeyCode == 18)
    #expect(combo("Comma", alt: true).carbonKeyCode == 43)
    #expect(combo("F5", alt: true).carbonKeyCode == 96)
    #expect(combo("Nope", alt: true).carbonKeyCode == nil)
}

@Test func carbonModifiers() {
    // cmdKey 0x100, shiftKey 0x200, optionKey 0x800, controlKey 0x1000
    #expect(combo("KeyE", meta: true, alt: true, ctrl: true, shift: true).carbonModifiers == 0x1B00)
    #expect(combo("KeyE", alt: true).carbonModifiers == 0x800)
}

@Test func effectiveReverseAuto() {
    #expect(Combo.effectiveReverse(forward: combo("KeyE", alt: true), reverse: nil) == combo("KeyE", alt: true, shift: true))
}

@Test func effectiveReverseCustom() {
    #expect(Combo.effectiveReverse(forward: combo("KeyE", alt: true), reverse: combo("KeyW", ctrl: true)) == combo("KeyW", ctrl: true))
}

@Test func effectiveReverseIsNilWhenForwardHasShift() {
    #expect(Combo.effectiveReverse(forward: combo("KeyE", meta: true, shift: true), reverse: nil) == nil)
}

@Test func decodesExtensionJSON() throws {
    let json = #"{ "code": "KeyE", "meta": false, "alt": true, "ctrl": false, "shift": false }"#
    #expect(try JSONDecoder().decode(Combo.self, from: Data(json.utf8)) == combo("KeyE", alt: true))
}

@Test func labelOrdersModifiersLikeMacOS() {
    #expect(combo("KeyE", meta: true, alt: true, ctrl: true, shift: true).label == "⌃ ⌥ ⇧ ⌘ E")
    #expect(combo("Digit1", alt: true).label == "⌥ 1")
    #expect(combo("Comma", ctrl: true).label == "⌃ ,")
    #expect(combo("F5", ctrl: true).label == "⌃ F5")
}

@Test func navigationKeyCodes() {
    #expect(Combo(code: "ArrowLeft").carbonKeyCode == 123)
    #expect(Combo(code: "ArrowRight").carbonKeyCode == 124)
    #expect(Combo(code: "Escape").carbonKeyCode == 53)
}
