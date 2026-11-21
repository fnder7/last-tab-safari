// Setup checklist. The app calls update() with the current state every second while the window is
// open, so steps tick themselves off as the user completes them in Safari.

function setStep(id, done) {
    const step = document.getElementById(id);
    step.classList.toggle("is-done", done === true);
    step.classList.toggle("is-unknown", done !== true && done !== false);
}

// state: { extensionEnabled: bool|null, extensionFound: bool, allSites: bool|null, loginEnabled: bool,
//          shortcut: string }
function update(state) {
    setStep("extension", state.extensionEnabled);
    document.getElementById("extension").classList.toggle("is-missing", state.extensionFound === false);
    // Only the extension can report website access, and only while it is on.
    setStep("websites", state.extensionEnabled === true ? state.allSites : null);
    setStep("login", state.loginEnabled);
    document.querySelector('[data-action="toggle-login"]').textContent = state.loginEnabled ? "Turn Off" : "Turn On";
    if (state.shortcut) document.getElementById("shortcut").textContent = state.shortcut;
}

document.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
        webkit.messageHandlers.controller.postMessage(button.dataset.action);
    });
});
