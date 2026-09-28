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
 */
let listeners: Listener[] = [];

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
   * Prevent the exact same listener from being registered
   * more than once.
   */
  if (!listeners.includes(listener)) {
    listeners.push(listener);
  }

  /**
   * Return cleanup function.
   */
  return () => {
    listeners = listeners.filter(
      (registeredListener) =>
        registeredListener !== listener
    );
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
   * Create a copy before notifying listeners.
   *
   * This prevents problems if one listener unsubscribes itself
   * while the notification loop is running.
   */
  const currentListeners = [...listeners];

  currentListeners.forEach((listener) => {
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
 * Both names now perform exactly the same operation.
 */
export const triggerAuthChange = (): void => {
  notifyAuthChanged();
};