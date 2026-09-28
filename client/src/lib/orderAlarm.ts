// client/src/lib/orderAlarm.ts
//
// ─────────────────────────────────────────────────────────────
// SINGLETON ORDER ALARM CONTROLLER
// ─────────────────────────────────────────────────────────────
//
// Plays the bundled alarm.mp3 at full volume, vibrates, and
// auto-stops after AUTO_STOP_MS milliseconds.
//
// Why a singleton?
//   • Both the socket listener (in useOrderNotifier) AND the
//     foreground push notification listener can fire when a new
//     order arrives while the app is open. Without a singleton,
//     the alarm would play TWICE.
//   • Any screen (admin/all-orders, chefManagement/all-orders)
//     can also trigger it — again without double-playing.
//
// Public API:
//   • startOrderAlarm()          → idempotent start
//   • stopOrderAlarm()           → idempotent stop
//   • restartOrderAlarm()        → stop + start
//   • isOrderAlarmPlaying()      → boolean
//   • subscribeOrderAlarm(fn)    → listen for state changes
//
// All functions are safe to call from anywhere, at any time,
// and will NEVER throw.
// ─────────────────────────────────────────────────────────────

import { Audio } from "expo-av";
import { Vibration } from "react-native";

// Bundled sound file — Metro will inline the asset reference.
// Path resolves from: client/src/lib/orderAlarm.ts
//                     →  ../../assets/sounds/alarm.mp3
const ALARM_SOUND = require("../../assets/sounds/alarm.mp3");

/** Auto-stop the alarm after this many milliseconds. */
const AUTO_STOP_MS = 10_000;

/** Repeating vibration pattern: wait, buzz, pause, buzz, pause, buzz… */
const VIBRATION_PATTERN = [0, 600, 300, 600, 300];

// ─────────────────────────────────────────────────────────────
// INTERNAL STATE
// ─────────────────────────────────────────────────────────────

type Listener = (isPlaying: boolean) => void;

let soundRef: Audio.Sound | null = null;
let isPlaying = false;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Monotonic generation counter.
 *
 * Every call to `startOrderAlarm` captures the current value.
 * Every call to `stopOrderAlarm` increments it.
 *
 * If a `startOrderAlarm` is still awaiting `Audio.Sound.createAsync`
 * when a `stopOrderAlarm` runs, the captured generation will no
 * longer match the current one — and the start will discard the
 * freshly created sound instead of playing it.
 */
let generation = 0;

/** In-flight start promise so concurrent starts share one operation. */
let startPromise: Promise<void> | null = null;

const listeners = new Set<Listener>();

// ─────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

const emit = (): void => {
  listeners.forEach((listener) => {
    try {
      listener(isPlaying);
    } catch (err) {
      console.log("orderAlarm listener error:", err);
    }
  });
};

const clearAutoStopTimer = (): void => {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
};

const teardownSound = async (): Promise<void> => {
  if (!soundRef) return;
  const ref = soundRef;
  soundRef = null;
  try {
    await ref.stopAsync();
  } catch {
    // ignore
  }
  try {
    await ref.unloadAsync();
  } catch {
    // ignore
  }
};

// ─────────────────────────────────────────────────────────────
// PUBLIC API — OBSERVERS
// ─────────────────────────────────────────────────────────────

/** Returns true while the alarm is actively playing. */
export const isOrderAlarmPlaying = (): boolean => isPlaying;

/**
 * Subscribe to alarm state changes.
 * The listener fires immediately with the current value,
 * then again on every start/stop.
 * Returns an unsubscribe function.
 */
export const subscribeOrderAlarm = (
  listener: Listener
): (() => void) => {
  listeners.add(listener);
  try {
    listener(isPlaying);
  } catch (err) {
    console.log("orderAlarm initial listener error:", err);
  }
  return () => {
    listeners.delete(listener);
  };
};

// ─────────────────────────────────────────────────────────────
// PUBLIC API — START
// ─────────────────────────────────────────────────────────────

/**
 * Start the alarm.
 * Idempotent — if the alarm is already playing, this does nothing.
 * Safe to call concurrently — shares one in-flight start.
 */
export const startOrderAlarm = async (): Promise<void> => {
  // Already ringing → no-op.
  if (isPlaying) return;

  // Another start is in-flight → wait for it, then bail.
  if (startPromise) {
    await startPromise;
    return;
  }

  const myGeneration = ++generation;

  startPromise = (async () => {
    try {
      // Configure audio mode so the alarm plays loudly.
      //   • playsInSilentModeIOS  → overrides the iOS silent switch
      //   • shouldDuckAndroid     → false so other audio pauses
      //   • staysActiveInBackground → false (we only ring in-app)
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(ALARM_SOUND, {
        shouldPlay: true,
        isLooping: true,
        volume: 1.0,
      });

      // If a stop (or a newer start) happened while we were loading,
      // discard this sound immediately.
      if (myGeneration !== generation) {
        try {
          await sound.stopAsync();
        } catch {
          // ignore
        }
        try {
          await sound.unloadAsync();
        } catch {
          // ignore
        }
        return;
      }

      // Tear down any leftover sound ref (defensive).
      if (soundRef && soundRef !== sound) {
        try {
          await soundRef.unloadAsync();
        } catch {
          // ignore
        }
        soundRef = null;
      }

      soundRef = sound;
      isPlaying = true;
      emit();

      // Repeating vibration.
      try {
        Vibration.vibrate(VIBRATION_PATTERN, true);
      } catch (vibErr) {
        console.log("orderAlarm vibration error:", vibErr);
      }

      // Auto-stop after AUTO_STOP_MS.
      clearAutoStopTimer();
      autoStopTimer = setTimeout(() => {
        void stopOrderAlarm();
      }, AUTO_STOP_MS);
    } catch (err) {
      console.log("orderAlarm start error:", err);
      isPlaying = false;
      emit();
    } finally {
      startPromise = null;
    }
  })();

  await startPromise;
};

// ─────────────────────────────────────────────────────────────
// PUBLIC API — STOP
// ─────────────────────────────────────────────────────────────

/**
 * Stop the alarm and cancel vibration.
 * Idempotent — safe to call even if the alarm is not playing.
 * Also cancels any pending start.
 */
export const stopOrderAlarm = async (): Promise<void> => {
  // Invalidate any in-flight start.
  generation++;

  clearAutoStopTimer();

  try {
    Vibration.cancel();
  } catch {
    // ignore
  }

  await teardownSound();

  if (isPlaying) {
    isPlaying = false;
    emit();
  }
};

// ─────────────────────────────────────────────────────────────
// PUBLIC API — RESTART
// ─────────────────────────────────────────────────────────────

/**
 * Convenience: stop + start.
 * Useful when the same alarm should re-fire for a new order
 * without waiting for the auto-stop timer.
 */
export const restartOrderAlarm = async (): Promise<void> => {
  await stopOrderAlarm();
  await startOrderAlarm();
};