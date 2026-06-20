import { useSyncExternalStore } from "react";

import {
  prefersReducedMotion,
  REDUCED_MOTION_MEDIA_QUERY,
} from "../../platform/reducedMotion";

/**
 * Reactively read the shared reduced-motion floor. Subscribes to runtime OS
 * changes and to the setting-owned document attribute that the CSS floor honors.
 */
function settingReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.reduceMotion === "true";
}

function readReducedMotion(): boolean {
  return prefersReducedMotion() || settingReducedMotion();
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  const matchMedia = globalThis.matchMedia;
  const mql =
    typeof matchMedia === "function" ? matchMedia(REDUCED_MOTION_MEDIA_QUERY) : null;
  mql?.addEventListener("change", onStoreChange);

  const observer =
    typeof document !== "undefined" && typeof MutationObserver === "function"
      ? new MutationObserver(onStoreChange)
      : null;
  if (typeof document !== "undefined") {
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduce-motion"],
    });
  }

  return () => {
    mql?.removeEventListener("change", onStoreChange);
    observer?.disconnect();
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
}
