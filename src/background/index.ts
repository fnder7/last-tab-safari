// Background entry point.
import { capturePreview } from './capture.ts';
import { createController } from './controller.ts';
import { createNativeBridge } from './native-bridge.ts';

createController(browser, {
  capture: (windowId) => capturePreview(browser, windowId),
  bridge: createNativeBridge(browser),
});
