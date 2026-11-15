import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { usePostHog } from "posthog-react-native";

import { colors } from "../constants/palette";
import { useAppDialog } from "../contexts/AppDialogContext";
import { Sentry } from "../lib/sentry";
import {
  DEFAULT_PREFERENCES,
  REMINDER_HOUR_OPTIONS,
  enableNotifications,
  fetchNotificationPreferences,
  getPermissionStatus,
  saveNotificationPreferences,
  type NotificationPreferences,
  type PermissionState,
} from "../lib/notifications";

type ToggleKey = "reminders" | "friend_activity" | "leaderboard";

const TOGGLES: { key: ToggleKey; title: string; description: string }[] = [
  {
    key: "reminders",
    title: "Reminders",
    description: "Daily log nudge and streak-at-risk alerts",
  },
  {
    key: "friend_activity",
    title: "Friend activity",
    description: "Friends hitting goals and group invitations",
  },
  {
    key: "leaderboard",
    title: "Leaderboard",
    description: "When someone passes you this week",
  },
];

export default function NotificationSettingsCard() {
  const posthog = usePostHog();
  const { showDialog } = useAppDialog();

  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_PREFERENCES,
  );
  const [permission, setPermission] =
    useState<PermissionState>("undetermined");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [stored, status] = await Promise.all([
        fetchNotificationPreferences(),
        getPermissionStatus(),
      ]);

      setPrefs(stored ?? DEFAULT_PREFERENCES);
      setPermission(status);
    } catch (error) {
      Sentry.logger.error("Notification settings failed to load", {
        operation: "load_notification_settings",
      });
      Sentry.captureException(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when the user comes back from the system settings screen.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void getPermissionStatus().then(setPermission);
      }
    });

    return () => subscription.remove();
  }, []);

  const masterOn = prefs.enabled && permission === "granted";
  const disabledByMaster = !masterOn || saving;

  const applyPrefs = async (next: NotificationPreferences) => {
    const previous = prefs;

    setPrefs(next);
    setSaving(true);

    try {
      await saveNotificationPreferences(next);
    } catch (error) {
      setPrefs(previous);

      Sentry.logger.error("Notification settings failed to save", {
        operation: "save_notification_settings",
      });
      Sentry.captureException(error);

      showDialog(
        "Couldn't save",
        "Your notification settings weren't saved. Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleMaster = async (value: boolean) => {
    if (saving) return;

    if (!value) {
      posthog.capture("notifications_disabled");
      await applyPrefs({ ...prefs, enabled: false });
      return;
    }

    if (permission !== "granted") {
      const result = await enableNotifications();

      if (result !== "granted") {
        setPermission(await getPermissionStatus());

        if (result === "unavailable") {
          showDialog(
            "Use a real device",
            "Push notifications don't work on simulators or the web.",
            [{ text: "OK" }],
            { type: "info" },
          );
        } else if (result === "error") {
          showDialog(
            "Couldn't turn on notifications",
            "Something went wrong. Please try again.",
            [{ text: "OK" }],
            { type: "error" },
          );
        } else {
          showDialog(
            "Notifications are blocked",
            "Allow notifications for BiteLog in your phone settings to get streak alerts and friend updates.",
            [
              { text: "Not now", style: "cancel" },
              {
                text: "Open settings",
                onPress: () => void Linking.openSettings(),
              },
            ],
            { type: "warning" },
          );
        }

        return;
      }

      setPermission("granted");
    }

    posthog.capture("notifications_enabled");
    await applyPrefs({ ...prefs, enabled: true });
  };

  const toggleCategory = (key: ToggleKey, value: boolean) => {
    posthog.capture("notification_preference_changed", {
      category: key,
      enabled: value,
    });

    void applyPrefs({ ...prefs, [key]: value });
  };

  const selectHour = (hour: number) => {
    if (hour === prefs.reminder_hour) return;

    posthog.capture("notification_preference_changed", {
      category: "reminder_hour",
      hour,
    });

    void applyPrefs({ ...prefs, reminder_hour: hour });
  };

  return (
    <View style={styles.card}>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Push notifications</Text>
              <Text style={styles.description}>
                {permission === "unavailable"
                  ? "Available on a physical phone only"
                  : permission === "denied"
                    ? "Blocked in your phone settings"
                    : "Streak alerts, friend updates and nudges. Max 2 a day."}
              </Text>
            </View>

            <Switch
              value={masterOn}
              onValueChange={(value) => void toggleMaster(value)}
              disabled={saving || permission === "unavailable"}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          {TOGGLES.map((item) => (
            <View
              key={item.key}
              style={[styles.row, styles.rowBorder, disabledByMaster && styles.dim]}
            >
              <View style={styles.rowText}>
                <Text style={styles.subTitle}>{item.title}</Text>
                <Text style={styles.description}>{item.description}</Text>
              </View>

              <Switch
                value={prefs[item.key]}
                onValueChange={(value) => toggleCategory(item.key, value)}
                disabled={disabledByMaster}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))}

          <View
            style={[
              styles.rowBorder,
              styles.timeBlock,
              (disabledByMaster || !prefs.reminders) && styles.dim,
            ]}
          >
            <Text style={styles.subTitle}>Daily reminder time</Text>
            <Text style={styles.description}>
              Only sent if you haven't logged anything yet.
            </Text>

            <View style={styles.chips}>
              {REMINDER_HOUR_OPTIONS.map((option) => {
                const selected = prefs.reminder_hour === option.hour;

                return (
                  <Pressable
                    key={option.hour}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => selectHour(option.hour)}
                    disabled={disabledByMaster || !prefs.reminders}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.chipText, selected && styles.chipTextSelected]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 28,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  rowBorder: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  subTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  description: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  dim: {
    opacity: 0.45,
  },
  timeBlock: {
    paddingBottom: 2,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.accentInk,
    fontWeight: "800",
  },
});
