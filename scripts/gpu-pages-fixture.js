// Static imports keep a single module identity under Vite HMR cache-busting.
export { T, N, fullscreen, readPixels } from "./tsl-fixture.js";
export {
  getGPUUploads,
  uploadTextures,
  setUploadsInteractive,
} from "../src/gpu-uploads.js";
export { prepareForRender } from "../src/renderer-jobs.js";
