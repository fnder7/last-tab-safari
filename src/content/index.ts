// Content script entry: turns keyboard events into menu actions and runs their effects.
import type { ListResponse, Request } from '../shared/messages.ts';
import { SHORTCUT } from '../shared/storage-keys.ts';
import { initial, reduce, type Action, type Effect, type MenuState } from './menu-state.ts';
import { createMenuView } from './menu-view.ts';
import { DEFAULT_SHORTCUT, isModifierRelease, isShortcut, matches, type Shortcut } from './shortcut.ts';

function start(): void {
  let shortcut: Shortcut = DEFAULT_SHORTCUT;
  let state: MenuState = initial();
  const view = createMenuView();

  const send = (request: Request) => browser.runtime.sendMessage(request);

  function dispatch(action: Action): void {
    const result = reduce(state, action);
    state = result.state;
    result.effects.forEach(run);
  }

  function run(effect: Effect): void {
    switch (effect.type) {
      case 'requestList':
        send({ type: 'menu:list' })
          .then((reply) => dispatch({ type: 'listLoaded', tabs: (reply as ListResponse | undefined)?.tabs ?? [] }))
          .catch(() => dispatch({ type: 'listLoaded', tabs: [] }));
        return;
      case 'render':
        view.render(effect.tabs, effect.index);
        return;
      case 'close':
        view.close();
        return;
      case 'activate':
        send({ type: 'menu:activate', tabId: effect.tabId }).catch(() => {});
        return;
    }
  }

  browser.storage.local.get(SHORTCUT).then((data) => {
    if (isShortcut(data[SHORTCUT])) shortcut = data[SHORTCUT];
  });
  browser.storage.onChanged.addListener((changes, area) => {
    const next = changes[SHORTCUT]?.newValue;
    if (area === 'local' && isShortcut(next)) shortcut = next;
  });

  const consume = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener(
    'keydown',
    (event) => {
      const dir = matches(event, shortcut);
      if (dir) {
        consume(event); // repeats included, so nothing is typed into the page
        dispatch({ type: 'press', dir });
        return;
      }
      if (state.phase === 'closed') return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        consume(event);
        dispatch({ type: 'arrow', dir: event.key === 'ArrowRight' ? 'right' : 'left' });
      } else if (event.key === 'Escape') {
        consume(event);
        dispatch({ type: 'escape' });
      }
    },
    true,
  );

  window.addEventListener(
    'keyup',
    (event) => {
      if (state.phase !== 'closed' && isModifierRelease(event, shortcut)) dispatch({ type: 'release' });
    },
    true,
  );

  window.addEventListener('blur', () => dispatch({ type: 'blur' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') dispatch({ type: 'blur' });
  });
}

if (window.top === window) start();
