import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import LottieView from "lottie-react-native";
import { Flame, Sparkles } from "lucide-react-native";

import { colors } from "../constants/palette";
import { recolorLottie } from "../lib/recolorLottie";
import {
  MAX_DAILY_POINTS,
  type RewardResult,
  type RewardType,
} from "../lib/rewards";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WINNER = require("../../assets/animations/Winner.json");

/** How long the popup stays up before closing itself. */
const AUTO_CLOSE_EARNED_MS = 8000;
const AUTO_CLOSE_PLAIN_MS = 4500;

/** Timeline (ms after the popup opens). */
const LOTTIE_DELAY_MS = 280;
const COUNT_DELAY_MS = 600;
const LINES_DELAY_MS = 900;

const LINE_LABEL: Record<RewardType, string> = {
  food_logged: "Logged food today",
  consistency_bonus: "3 meals logged",
  calorie_goal_completed: "Calorie goal hit",
};

type Props = {
  visible: boolean;
  result: RewardResult;
  /** e.g. the food name, shown under the headline */
  subtitle?: string;
  onClose: () => void;
};

export default function RewardBadge({
  visible,
  result,
  subtitle,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 48, 340);
  const earned = result.total > 0;

  // Recolour once, not on every render.
  const animation = useMemo(() => recolorLottie(WINNER), []);

  const lottieRef = useRef<LottieView>(null);

  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const lift = useRef(new Animated.Value(28)).current;
  const count = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const lines = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const [shownPoints, setShownPoints] = useState(0);

  useEffect(() => {
    if (!visible) return;

    closing.current = false;
    setShownPoints(0);
    fade.setValue(0);
    scale.setValue(0.85);
    lift.setValue(28);
    count.setValue(0);
    bar.setValue(0);
    lines.setValue(0);
    lottieRef.current?.reset();

    const listenerId = count.addListener(({ value }) =>
      setShownPoints(Math.round(value)),
    );

    const timers: ReturnType<typeof setTimeout>[] = [];

    // 1. Card fades + springs in
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }),
      Animated.spring(lift, {
        toValue: 0,
        friction: 8,
        tension: 55,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Trophy animation
    timers.push(setTimeout(() => lottieRef.current?.play(), LOTTIE_DELAY_MS));

    // 3. Points count up + progress bar fill
    timers.push(
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(count, {
            toValue: result.total,
            duration: 1100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: Math.min(result.todayPoints / MAX_DAILY_POINTS, 1),
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        ]).start();
      }, COUNT_DELAY_MS),
    );

    // 4. Reward lines slide in one by one
    timers.push(
      setTimeout(() => {
        Animated.timing(lines, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, LINES_DELAY_MS),
    );

    // Auto close, later when points were earned so there's time to read it
    timers.push(
      setTimeout(
        close,
        result.total > 0 ? AUTO_CLOSE_EARNED_MS : AUTO_CLOSE_PLAIN_MS,
      ),
    );

    return () => {
      timers.forEach(clearTimeout);
      count.removeListener(listenerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function close() {
    if (closing.current) return;
    closing.current = true;

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.94,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 14,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }

  const barWidth = bar.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />

        <Animated.View
          style={[
            styles.card,
            {
              width: cardWidth,
              transform: [{ translateY: lift }, { scale }],
            },
          ]}
        >
          <View style={styles.lottieWrap}>
            <LottieView
              ref={lottieRef}
              source={animation}
              autoPlay={false}
              loop={false}
              style={styles.lottie}
              resizeMode="contain"
            />
          </View>

          <View style={styles.eyebrowPill}>
            <Sparkles size={12} color={colors.accentInk} />
            <Text style={styles.eyebrow}>
              {earned ? "MEAL LOGGED" : "NICE ONE"}
            </Text>
          </View>

          {earned ? (
            <View style={styles.pointsRow}>
              <Text style={styles.plus}>+</Text>
              <Text style={styles.points}>{shownPoints}</Text>
              <Text style={styles.pts}>pts</Text>
            </View>
          ) : (
            <Text style={styles.noPointsTitle}>Added to your day</Text>
          )}

          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          )}

          {earned && (
            <View style={styles.lines}>
              {result.lines.map((line, index) => {
                const start = Math.min(index * 0.22, 0.6);
                const range = [start, start + 0.4];

                return (
                  <Animated.View
                    key={line.type}
                    style={[
                      styles.line,
                      {
                        opacity: lines.interpolate({
                          inputRange: range,
                          outputRange: [0, 1],
                          extrapolate: "clamp",
                        }),
                        transform: [
                          {
                            translateY: lines.interpolate({
                              inputRange: range,
                              outputRange: [14, 0],
                              extrapolate: "clamp",
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Text style={styles.lineLabel}>
                      {LINE_LABEL[line.type]}
                    </Text>
                    <View style={styles.linePill}>
                      <Text style={styles.linePillText}>+{line.points}</Text>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}

          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Today</Text>
              <Text style={styles.progressValue}>
                {result.todayPoints}/{MAX_DAILY_POINTS} pts
              </Text>
            </View>
            <View style={styles.track}>
              <Animated.View style={[styles.fill, { width: barWidth }]} />
            </View>
          </View>

          {result.currentStreak > 0 && (
            <View style={styles.streak}>
              <Flame size={15} color={colors.warm} />
              <Text style={styles.streakText}>
                {result.currentStreak}-day streak
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            onPress={close}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Keep going</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingBottom: 22,
    borderRadius: 32,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lottieWrap: {
    width: 190,
    height: 170,
    marginTop: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  lottie: { width: 190, height: 190 },
  eyebrowPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: colors.accentInk,
  },
  pointsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 10,
  },
  plus: { fontSize: 30, fontWeight: "900", color: colors.accentInk },
  points: {
    fontSize: 64,
    lineHeight: 70,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -2,
  },
  pts: {
    marginLeft: 6,
    fontSize: 18,
    fontWeight: "800",
    color: colors.muted,
  },
  noPointsTitle: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    maxWidth: "90%",
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  lines: { alignSelf: "stretch", marginTop: 16, gap: 8 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
  },
  lineLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  linePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  linePillText: { fontSize: 12, fontWeight: "900", color: colors.onAccent },
  progressBlock: { alignSelf: "stretch", marginTop: 16 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  progressLabel: { fontSize: 12, fontWeight: "700", color: colors.muted },
  progressValue: { fontSize: 12, fontWeight: "800", color: colors.text },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  fill: { height: "100%", borderRadius: 5, backgroundColor: colors.accent },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  streakText: { fontSize: 13, fontWeight: "800", color: colors.warm },
  button: {
    alignSelf: "stretch",
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: colors.accent,
  },
  buttonText: { fontSize: 15, fontWeight: "900", color: colors.onAccent },
  pressed: { opacity: 0.8 },
});