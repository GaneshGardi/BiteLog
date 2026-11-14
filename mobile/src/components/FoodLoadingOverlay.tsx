import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";
import LottieView from "lottie-react-native";

import { colors } from "../constants/palette";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FOOD_CAROUSEL = require("../../assets/animations/Food_Carousel.json");

const MESSAGE_INTERVAL_MS = 2400;

type Props = {
  visible: boolean;
  title: string;
  /** Short lines that rotate under the title. Pass a stable (module-level) array. */
  messages: string[];
};

export default function FoodLoadingOverlay({
  visible,
  title,
  messages,
}: Props) {
  const [mounted, setMounted] = useState(visible);
  const [messageIndex, setMessageIndex] = useState(0);

  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(18)).current;
  const textOpacity = useRef(new Animated.Value(1)).current;

  // Fade in / out
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setMessageIndex(0);
      textOpacity.setValue(1);
      fade.setValue(0);
      lift.setValue(18);

      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(lift, {
          toValue: 0,
          friction: 8,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start();

      return;
    }

    Animated.timing(fade, {
      toValue: 0,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, fade, lift, textOpacity]);

  // Rotate the message with a soft cross-fade
  useEffect(() => {
    if (!visible || messages.length < 2) return;

    const interval = setInterval(() => {
      Animated.timing(textOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;

        setMessageIndex((index) => (index + 1) % messages.length);

        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }).start();
      });
    }, MESSAGE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [visible, messages, textOpacity]);

  if (!mounted) return null;

  const message = messages[messageIndex % Math.max(messages.length, 1)] ?? "";

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
    >
      <Animated.View
        style={[styles.card, { transform: [{ translateY: lift }] }]}
      >
        <LottieView
          source={FOOD_CAROUSEL}
          autoPlay
          loop
          style={styles.lottie}
          resizeMode="contain"
        />

        <Text style={styles.title}>{title}</Text>

        <Animated.Text style={[styles.message, { opacity: textOpacity }]}>
          {message}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    zIndex: 100,
    elevation: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.82)",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 26,
    paddingHorizontal: 22,
    borderRadius: 30,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lottie: {
    width: 190,
    height: 190,
  },
  title: {
    marginTop: 6,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: -0.3,
    color: colors.text,
    textAlign: "center",
  },
  message: {
    marginTop: 8,
    minHeight: 36,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    textAlign: "center",
  },
});