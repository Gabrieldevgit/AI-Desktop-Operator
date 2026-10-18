import type { DtsApi } from "../preload/preload";

declare global {
  interface Window {
    dts: DtsApi;
  }
}
export {};
