// The only DOM code of the menu: a horizontal strip of tab cards in a closed shadow root.
// Tab data is only ever written through textContent / src, never parsed as HTML.
import type { MenuTab } from '../shared/messages.ts';

export type MenuView = {
  render(tabs: MenuTab[], index: number): void;
  close(): void;
};

const STYLE = `
  :host { all: initial; }
  .overlay {
    position: fixed; inset: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    font: 12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  }
  .panel {
    display: flex; gap: 12px; padding: 14px;
    max-width: 90vw; overflow-x: auto; scrollbar-width: none;
    background: rgba(28, 28, 30, 0.92); color: #f5f5f7;
    border-radius: 16px; box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
    -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
  }
  .panel::-webkit-scrollbar { display: none; }
  .card { flex: none; width: 200px; padding: 6px; border-radius: 12px; }
  .card.selected { outline: 3px solid #0a84ff; background: rgba(10, 132, 255, 0.18); }
  .thumb {
    width: 200px; height: 125px; border-radius: 8px; overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    display: flex; align-items: center; justify-content: center;
  }
  .thumb img.preview { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .thumb img.big-icon { width: 48px; height: 48px; }
  .thumb .letter { font-size: 40px; font-weight: 600; opacity: 0.7; }
  .meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; min-width: 0; }
  .meta img { width: 16px; height: 16px; flex: none; }
  .title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function image(src: string, className: string): HTMLImageElement {
  const img = el('img', className);
  img.src = src;
  img.alt = '';
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

function buildCard(tab: MenuTab, selected: boolean): HTMLElement {
  const card = el('div', selected ? 'card selected' : 'card');

  const thumb = el('div', 'thumb');
  if (tab.preview) {
    thumb.append(image(tab.preview, 'preview'));
  } else if (tab.favIconUrl) {
    thumb.append(image(tab.favIconUrl, 'big-icon'));
  } else {
    const letter = el('span', 'letter');
    letter.textContent = (tab.title.trim()[0] ?? '•').toUpperCase();
    thumb.append(letter);
  }

  const meta = el('div', 'meta');
  if (tab.favIconUrl) meta.append(image(tab.favIconUrl, ''));
  const title = el('span', 'title');
  title.textContent = tab.title || 'Untitled';
  meta.append(title);

  card.append(thumb, meta);
  return card;
}

export function createMenuView(): MenuView {
  let host: HTMLElement | null = null;
  let panel: HTMLElement | null = null;

  function mount(): HTMLElement {
    host = document.createElement('last-tab-menu');
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const overlay = el('div', 'overlay');
    panel = el('div', 'panel');
    overlay.append(panel);
    root.append(style, overlay);
    document.documentElement.append(host);
    return panel;
  }

  return {
    render(tabs, index) {
      const target = panel ?? mount();
      const cards = tabs.map((tab, i) => buildCard(tab, i === index));
      target.replaceChildren(...cards);
      cards[index]?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    },
    close() {
      host?.remove();
      host = null;
      panel = null;
    },
  };
}
