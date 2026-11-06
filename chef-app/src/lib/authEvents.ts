type Listener = () => void;

/**
 * ============================================================
 * AUTH EVENT LISTENERS
 * ============================================================
 *
 * These listeners are used to notify the application whenever
 * the Katbox authentication state changes.
 *
 * Examples:
 *
 * LOGIN
 *   ↓
 * saveSession()
 *   ↓
 * notifyAuthChanged()
 *   ↓
 * _layout.tsx checks authentication
 *
 * LOGOUT
 *   ↓
 * removeToken()
 *   ↓
 * notifyAuthChanged()
 *   ↓
 * _layout.tsx checks authentication
 */

/**
 * Store all active authentication listeners.
 *
 * Set prevents the same listener from being registered
 * more than once.
 */
const listeners = new Set<Listener>();

/**
 * ============================================================
 * SUBSCRIBE TO AUTH CHANGES
 * ============================================================
 *
 * Returns an unsubscribe function so components can clean up
 * their listener when they unmount.
 */
export const subscribeAuth = (
  listener: Listener
): (() => void) => {
  /**
   * Register the listener.
   *
   * Set automatically prevents duplicate registrations
   * of the exact same function reference.
   */
  listeners.add(listener);

  /**
   * Return cleanup function.
   *
   * Calling this function multiple times is safe.
   */
  return () => {
    listeners.delete(listener);
  };
};

/**
 * ============================================================
 * NOTIFY AUTH CHANGED
 * ============================================================
 *
 * Call this after:
 *
 * - successful login
 * - logout
 * - session expiration
 * - manually clearing authentication
 */
export const notifyAuthChanged = (): void => {
  /**
   * Create a snapshot before notifying listeners.
   *
   * This prevents problems if one listener subscribes
   * or unsubscribes while the notification loop is running.
   */
  const currentListeners = Array.from(listeners);

  currentListeners.forEach((listener) => {
    /**
     * Only notify listeners that are still registered.
     *
     * This avoids calling a listener that was unsubscribed
     * during an earlier callback.
     */
    if (!listeners.has(listener)) {
      return;
    }

    try {
      listener();
    } catch (error) {
      /**
       * One broken listener should not prevent the remaining
       * listeners from receiving the authentication event.
       */
      console.error(
        "Auth listener error:",
        error
      );
    }
  });
};

/**
 * ============================================================
 * COMPATIBILITY ALIAS
 * ============================================================
 *
 * Some existing screens use:
 *
 * triggerAuthChange()
 *
 * while other parts of the application use:
 *
 * notifyAuthChanged()
 *
 * Both names perform exactly the same operation.
 */
export const triggerAuthChange = (): void => {
  notifyAuthChanged();
};