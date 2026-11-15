import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Bell } from "lucide-react-native";
import { usePostHog } from "posthog-react-native";

import { colors } from "../constants/palette";
import { useAppDialog } from "../contexts/AppDialogContext";
import {
  enableNotifications,
  getPermissionStatus,
} from "../lib/notifications";

const DISMISSED_KEY = "bitelog.notifOptIn.dismissedAt";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Friendly, non-blocking prompt on the Home screen. It only appears when
 * the OS permission has never been asked, and it never stacks on top of
 * the reward popup because it is an inline card, not a modal.
 */
export default function NotificationOptInCard() {
  const posthog = usePostHog();
  const { showDialog } = useAppDialog();

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        if ((await getPermissionStatus()) !== "undetermined") return;

        const dismissedAt = Number(await AsyncStorage.getItem(DISMISSED_KEY));

        if (dismissedAt && Date.now() - dismissedAt < SNOOZE_MS) return;

        if (!cancelled) {
          setVisible(true);
          posthog.capture("notification_optin_shown");
        }
      } catch {
        // If anything fails, just don't show the card.
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [posthog]);

  const snooze = async () => {
    setVisible(false);

    try {
      await AsyncStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Ignore storage errors.
    }
  };

  const handleEnable = async () => {
    if (busy) return;

    setBusy(true);

    try {
      const result = await enableNotifications();

      posthog.capture("notification_optin_result", { result });

      if (result === "granted") {
        setVisible(false);
        return;
      }

      if (result === "error") {
        showDialog(
          "Couldn't turn on notifications",
          "Something went wrong. You can try again from your Profile.",
          [{ text: "OK" }],
          { type: "error" },
        );
      }

      await snooze();
    } finally {
      setBusy(false);
    }
  };

  const handleLater = () => {
    posthog.capture("notification_optin_dismissed");
    void snooze();
  };

  if (!visible) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Bell size={22} color={colors.accentInk} />
        </View>

        <View style={styles.textWrap}>
          <Text style={styles.title}>Don't lose your streak 🔥</Text>
          <Text style={styles.body}>
            Get a ping when friends pass you, your streak is at risk, or
            easy points are up for grabs. Max 2 a day, no spam.
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            busy && styles.disabled,
          ]}
          onPress={handleEnable}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Turn on notifications"
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.primaryText}>Turn on</Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
          onPress={handleLater}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
        >
          <Text style={styles.ghostText}>Maybe later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  body: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
  },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: "900",
  },
  ghostButton: {
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
});
