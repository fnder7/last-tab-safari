// Background entry point.
import { capturePreview } from './capture.ts';
import { createController } from './controller.ts';

createController(browser, { capture: (windowId) => capturePreview(browser, windowId) });
