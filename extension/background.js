// SPIKE (throwaway): visible effect to check whether the command fires.
browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-last-tab') return;
  const [first] = await browser.tabs.query({ currentWindow: true, index: 0 });
  if (first) await browser.tabs.update(first.id, { active: true });
});
