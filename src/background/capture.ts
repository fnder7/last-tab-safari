// Captures the visible tab of a window and downscales it for the menu card.
import type { Browser } from 'webextension-polyfill';

const PREVIEW_WIDTH = 400;

export async function capturePreview(browser: Browser, windowId: number): Promise<string> {
  const full = await browser.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 60 });
  if (typeof OffscreenCanvas === 'undefined') return full;

  const bitmap = await createImageBitmap(await (await fetch(full)).blob());
  const height = Math.max(1, Math.round((PREVIEW_WIDTH * bitmap.height) / bitmap.width));
  const canvas = new OffscreenCanvas(PREVIEW_WIDTH, height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, PREVIEW_WIDTH, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
