import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = {
  /** Changing this value shows the toast again. */
  toastId: number;
  title: string;
  subtitle: string;
  onDone: () => void;
};

/**
 * Small banner that slides in from the top and hides itself, e.g.
 * "+12 pts · Day complete!". It never blocks touches.
 */
export default function PointsToast({
  toastId,
  title,
  subtitle,
  onDone,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(-16);

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(2400),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) onDone();
    });

    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastId]);

  return (
    <SafeAreaView style={styles.wrapper} edges={["top"]} pointerEvents="none">
      <Animated.View
        style={[styles.toast, { opacity, transform: [{ translateY }] }]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.pill}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1F2619",
    borderWidth: 1,
    borderColor: "#46543A",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  pill: {
    backgroundColor: "#B6F36B",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  title: {
    color: "#101010",
    fontSize: 14,
    fontWeight: "800",
  },
  subtitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
