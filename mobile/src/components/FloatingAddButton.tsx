import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router } from "expo-router";
import { ChevronRight, Plus, ScanLine, Search } from "lucide-react-native";
import { usePostHog } from "posthog-react-native";

import { colors } from "../constants/palette";

const FAB_SIZE = 64;

type Props = {
  /** Distance from the bottom of the screen to the bottom of the button. */
  bottomOffset: number;
};

export default function FloatingAddButton({ bottomOffset }: Props) {
  const posthog = usePostHog();
  const { width } = useWindowDimensions();
  const menuWidth = Math.min(width - 40, 340);

  const [mounted, setMounted] = useState(false);
  const openRef = useRef(false);

  // 0 = closed, 1 = open
  const progress = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  // Ambient motion: gentle bob + soft pulse ring.
  useEffect(() => {
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const ring = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(900),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );

    bob.start();
    ring.start();
    return () => {
      bob.stop();
      ring.stop();
    };
  }, [float, pulse]);

  const open = useCallback(() => {
    if (openRef.current) return;
    openRef.current = true;
    posthog.capture("add_menu_opened");
    setMounted(true);
    Animated.spring(progress, {
      toValue: 1,
      friction: 8,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [posthog, progress]);

  const close = useCallback(
    (after?: () => void) => {
      if (!openRef.current) return;
      openRef.current = false;
      Animated.timing(progress, {
        toValue: 0,
        duration: 170,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setMounted(false);
        after?.();
      });
    },
    [progress],
  );

  // Android back button closes the menu first.
  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [mounted, close]);

  function go(path: "/add-food" | "/scan-meal", source: string) {
    posthog.capture("add_menu_option_selected", { source });
    close(() => router.push(path));
  }

  const bobY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.65],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "135deg"],
  });
  const backdrop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  // Each menu card rises in, slightly staggered (nearest to the button first).
  const itemStyle = (from: number) => ({
    opacity: progress.interpolate({
      inputRange: [from, 1],
      outputRange: [0, 1],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [from, 1],
          outputRange: [28, 0],
          extrapolate: "clamp",
        }),
      },
      {
        scale: progress.interpolate({
          inputRange: [from, 1],
          outputRange: [0.92, 1],
          extrapolate: "clamp",
        }),
      },
    ],
  });

  const menuBottom = bottomOffset + FAB_SIZE + 16;

  return (
    <>
      {mounted && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => close()}
            accessibilityLabel="Close add menu"
          />
        </Animated.View>
      )}

      {mounted && (
        <View
          pointerEvents="box-none"
          style={[styles.menuLayer, { bottom: menuBottom }]}
        >
          <Animated.View style={[{ width: menuWidth }, itemStyle(0.25)]}>
            <Pressable
              style={({ pressed }) => [
                styles.option,
                styles.optionPrimary,
                pressed && styles.pressed,
              ]}
              onPress={() => go("/scan-meal", "ai_scan")}
              accessibilityRole="button"
              accessibilityLabel="Scan meal with AI"
            >
              <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                <ScanLine size={22} color={colors.onAccent} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: colors.onAccent }]}>
                  Scan with AI
                </Text>
                <Text style={[styles.optionSub, { color: colors.onAccent, opacity: 0.7 }]}>
                  Snap a photo, we estimate it
                </Text>
              </View>
              <ChevronRight size={20} color={colors.onAccent} />
            </Pressable>
          </Animated.View>

          <Animated.View style={[{ width: menuWidth, marginTop: 10 }, itemStyle(0)]}>
            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              onPress={() => go("/add-food", "manual")}
              accessibilityRole="button"
              accessibilityLabel="Add food manually"
            >
              <View style={styles.optionIcon}>
                <Search size={21} color={colors.accentInk} />
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Add manually</Text>
                <Text style={styles.optionSub}>Search foods, enter portions</Text>
              </View>
              <ChevronRight size={20} color={colors.muted} />
            </Pressable>
          </Animated.View>
        </View>
      )}

      <View
        pointerEvents="box-none"
        style={[styles.fabLayer, { bottom: bottomOffset }]}
      >
        <Animated.View
          style={{ transform: [{ translateY: mounted ? 0 : bobY }] }}
        >
          {!mounted && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                { opacity: ringOpacity, transform: [{ scale: ringScale }] },
              ]}
            />
          )}

          <Animated.View style={{ transform: [{ scale: press }] }}>
            <Pressable
              onPress={() => (openRef.current ? close() : open())}
              onPressIn={() =>
                Animated.spring(press, {
                  toValue: 0.92,
                  useNativeDriver: true,
                  friction: 7,
                }).start()
              }
              onPressOut={() =>
                Animated.spring(press, {
                  toValue: 1,
                  useNativeDriver: true,
                  friction: 5,
                }).start()
              }
              style={styles.fab}
              accessibilityRole="button"
              accessibilityLabel={mounted ? "Close add menu" : "Add food"}
            >
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Plus size={30} color={colors.onAccent} strokeWidth={3} />
              </Animated.View>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay },
  fabLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  ring: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.accent,
  },
  menuLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 15,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  optionIconPrimary: { backgroundColor: "rgba(255,255,255,0.45)" },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  optionSub: { marginTop: 3, fontSize: 12, color: colors.muted },
  pressed: { opacity: 0.8 },
});
