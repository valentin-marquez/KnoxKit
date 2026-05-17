import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
import type { Event } from "@/types/events";

/**
 * The single Tauri channel every backend event is emitted on.
 *
 * keep in sync with src-tauri/src/events.rs (`events::CHANNEL`)
 */
const CHANNEL = "knoxkit://event";

type ByType<E extends Event["type"]> = Extract<Event, { type: E }>;

/**
 * Subscribe to a backend event outside of React. Returns the promise of an
 * unlisten function — await and call it to stop listening.
 *
 * The backend multiplexes every event onto one Tauri channel
 * (`knoxkit://event`) and discriminates with the `type` field; this filters
 * that stream down to the requested variant.
 */
export function onEvent<E extends Event["type"]>(
  name: E,
  handler: (payload: ByType<E>) => void,
): Promise<UnlistenFn> {
  return listen<Event>(CHANNEL, (event) => {
    if (event.payload.type === name) {
      handler(event.payload as ByType<E>);
    }
  });
}

/**
 * React hook: subscribe to a backend event for the lifetime of the component.
 * The listener is registered on mount and torn down on unmount.
 */
export function useEvent<E extends Event["type"]>(
  name: E,
  handler: (payload: ByType<E>) => void,
): void {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    onEvent(name, handler).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [name, handler]);
}
