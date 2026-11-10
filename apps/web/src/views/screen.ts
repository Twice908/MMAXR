import type { Route } from "../router.js";

/** A mounted page. The app asks it to animate away before disposing it. */
export interface Screen {
  /** Play the exit towards `to`. Resolves when the screen may be removed. */
  leave(to: Route): Promise<void>;
  /** Remove listeners, bodies and DOM. */
  dispose(): void;
}
