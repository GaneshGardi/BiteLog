import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Text,
  type StyleProp,
  type TextStyle,
} from "react-native";

type Props = {
  value: number;
  /** Digits after the decimal point. */
  decimals?: number;
  duration?: number;
  /** Count up from 0 the first time it appears. */
  animateOnMount?: boolean;
  locale?: string;
  style?: StyleProp<TextStyle>;
};

export default function AnimatedNumber({
  value,
  decimals = 0,
  duration = 800,
  animateOnMount = true,
  locale = "en-IN",
  style,
}: Props) {
  const target = Number.isFinite(value) ? value : 0;

  const animated = useRef(
    new Animated.Value(animateOnMount ? 0 : target),
  ).current;

  const format = useCallback(
    (n: number) =>
      n.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [decimals, locale],
  );

  const [text, setText] = useState(format(animateOnMount ? 0 : target));

  useEffect(() => {
    const id = animated.addListener(({ value: v }) => setText(format(v)));
    return () => animated.removeListener(id);
  }, [animated, format]);

  useEffect(() => {
    const animation = Animated.timing(animated, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start();
    return () => animation.stop();
  }, [target, duration, animated]);

  return <Text style={style}>{text}</Text>;
}