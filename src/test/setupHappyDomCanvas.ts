import { CanvasAdapter } from '@happy-dom/node-canvas-adapter';

type HappyDomWindow = Window & {
  happyDOM: { settings: { canvasAdapter: CanvasAdapter | null } };
  createImageBitmap: typeof createImageBitmap;
};

const happyWindow = window as unknown as HappyDomWindow;
happyWindow.happyDOM.settings.canvasAdapter = new CanvasAdapter();
