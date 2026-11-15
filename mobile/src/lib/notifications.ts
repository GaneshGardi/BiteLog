import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { supabase } from "./supabase";
import { Sentry } from "./sentry";

/* ------------------------------------------------------------------ */
/* Foreground behaviour                                                */
/* ------------------------------------------------------------------ */

// Show a banner even while the app is open (like an in-app toast).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PermissionState =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable";

export type EnableResult = "granted" | "denied" | "unavailable" | "error";

export type NotificationPreferences = {
  enabled: boolean;
  reminders: boolean;
  friend_activity: boolean;
  leaderboard: boolean;
  reminder_hour: number;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  reminders: true,
  friend_activity: true,
  leaderboard: true,
  reminder_hour: 19,
};

/** Reminder times offered in the UI (must stay within 8-20). */
export const REMINDER_HOUR_OPTIONS = [
  { hour: 12, label: "12 PM" },
  { hour: 17, label: "5 PM" },
  { hour: 18, label: "6 PM" },
  { hour: 19, label: "7 PM" },
  { hour: 20, label: "8 PM" },
] as const;

const PUSH_TOKEN_KEY = "bitelog.pushToken";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const canUsePush = () => Platform.OS !== "web" && Device.isDevice;

function getTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "BiteLog updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 150, 200],
    lightColor: "#B6F36B",
  });
}

async function registerDeviceToken() {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error("EAS project ID is missing from the app config.");
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  const { error } = await supabase.rpc("register_push_token", {
    p_token: token,
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    p_timezone: getTimeZone(),
  });

  if (error) throw error;

  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
}

/* ------------------------------------------------------------------ */
/* Permission + registration                                           */
/* ------------------------------------------------------------------ */

export async function getPermissionStatus(): Promise<PermissionState> {
  if (!canUsePush()) return "unavailable";

  const permission = await Notifications.getPermissionsAsync();

  if (permission.granted) return "granted";

  return permission.status === Notifications.PermissionStatus.UNDETERMINED
    ? "undetermined"
    : "denied";
}

/**
 * Asks for permission (if still possible) and registers this device.
 * Call this only from a user action, never on app launch.
 */
export async function enableNotifications(): Promise<EnableResult> {
  if (!canUsePush()) return "unavailable";

  try {
    await ensureAndroidChannel();

    let permission = await Notifications.getPermissionsAsync();

    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
    }

    if (!permission.granted) return "denied";

    await registerDeviceToken();
    return "granted";
  } catch (error) {
    Sentry.logger.error("Enabling notifications failed", {
      operation: "enable_notifications",
    });
    Sentry.captureException(error);
    return "error";
  }
}

/**
 * Silent re-sync on launch. Only runs if permission was already granted,
 * so it never shows a permission prompt. Keeps the token and the
 * timezone fresh. Never throws.
 */
export async function syncPushTokenIfGranted(): Promise<boolean> {
  if (!canUsePush()) return false;

  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return false;

    await ensureAndroidChannel();
    await registerDeviceToken();
    return true;
  } catch (error) {
    Sentry.logger.error("Push token sync failed", {
      operation: "sync_push_token",
    });
    Sentry.captureException(error);
    return false;
  }
}

/** Removes this device's token. Call before signing out. Never throws. */
export async function unregisterPushToken() {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) return;

    await supabase.rpc("unregister_push_token", { p_token: token });
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch (error) {
    Sentry.captureException(error);
  }
}

/** Analytics only: records that the user tapped a notification. */
export async function markNotificationOpened(notificationId?: string | null) {
  if (!notificationId) return;

  try {
    await supabase.rpc("mark_notification_opened", { p_id: notificationId });
  } catch {
    // Not important enough to surface.
  }
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

/** Returns null when the user has never saved preferences. */
export async function fetchNotificationPreferences(): Promise<NotificationPreferences | null> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("enabled, reminders, friend_activity, leaderboard, reminder_hour")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    enabled: Boolean(data.enabled),
    reminders: Boolean(data.reminders),
    friend_activity: Boolean(data.friend_activity),
    leaderboard: Boolean(data.leaderboard),
    reminder_hour: Number(data.reminder_hour) || DEFAULT_PREFERENCES.reminder_hour,
  };
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
) {
  const { error } = await supabase.rpc("save_notification_preferences", {
    p_enabled: prefs.enabled,
    p_reminders: prefs.reminders,
    p_friend_activity: prefs.friend_activity,
    p_leaderboard: prefs.leaderboard,
    p_reminder_hour: prefs.reminder_hour,
  });

  if (error) throw error;
}