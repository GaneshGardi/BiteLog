import React from "react";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

type Props = {
  width?: number;
  height?: number;
};

/**
 * BiteLog mark: calorie ring (with a bite taken out) + three macro bars.
 * No masks are used (they are unreliable on Android), the bite is real
 * path geometry, so it renders identically everywhere.
 */
export default function BiteLogMark({ width = 52, height = 52 }: Props) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="98 98 404 404"
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs>
        <LinearGradient id="biteGradient" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E4FF4F" />
          <Stop offset="1" stopColor="#7EE22B" />
        </LinearGradient>
      </Defs>

      {/* Remaining-calories track (upper-left quarter) */}
      <Path
        d="M150 280 A150 150 0 0 1 300 130"
        fill="none"
        stroke="#2A3A1A"
        strokeWidth={44}
        strokeLinecap="round"
      />

      {/* Calories-consumed ring with the bite cut out of its outer edge */}
      <Path
        d="M300 108
           A172 172 0 0 1 366.3 121.3
           A28 28 0 0 0 398.8 161.1
           A34 34 0 0 0 436.7 203.1
           A26 26 0 0 0 467.4 240.3
           A172 172 0 1 1 128 280
           A22 22 0 0 1 172 280
           A128 128 0 1 0 300 152
           A22 22 0 0 1 300 108 Z"
        fill="url(#biteGradient)"
      />

      {/* Macro bars */}
      <Rect x={232} y={266} width={34} height={64} rx={17} fill="#7EE22B" />
      <Rect x={283} y={222} width={34} height={108} rx={17} fill="url(#biteGradient)" />
      <Rect x={334} y={246} width={34} height={84} rx={17} fill="#B6F23A" />
    </Svg>
  );
}
