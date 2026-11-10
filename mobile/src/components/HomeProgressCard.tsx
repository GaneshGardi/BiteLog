import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, Flame, Trophy } from "lucide-react-native";

import {
  DAILY_POINT_CAP,
  type GamificationSummary,
} from "../lib/gamification";

const CARD = "#1A1A1A";
const ACCENT = "#B6F36B";
const MUTED = "#999999";
const BORDER = "#303030";
const FLAME = "#FF9A76";

type Props = {
  summary: GamificationSummary;
};

export default function HomeProgressCard({ summary }: Props) {
  const { todayPoints, weekPoints, currentStreak, bestGroup, groupCount } =
    summary;

  const todayWidth = `${Math.round(
    Math.min(todayPoints / DAILY_POINT_CAP, 1) * 100,
  )}%` as `${number}%`;

  const openGroup = () => {
    if (!bestGroup) return;

    router.push({
      pathname: "/group/[id]",
      params: { id: bestGroup.group_id },
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>YOUR WEEK</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <View style={styles.statValueRow}>
            <Flame
              size={20}
              color={currentStreak > 0 ? FLAME : "#555555"}
              fill={currentStreak > 0 ? FLAME : "transparent"}
            />
            <Text style={styles.statValue}>{currentStreak}</Text>
          </View>
          <Text style={styles.statLabel}>day streak</Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {todayPoints}
            <Text style={styles.statUnit}>/{DAILY_POINT_CAP}</Text>
          </Text>
          <Text style={styles.statLabel}>points today</Text>
        </View>

        <View style={styles.stat}>
          <Text style={[styles.statValue, styles.accent]}>{weekPoints}</Text>
          <Text style={styles.statLabel}>points this week</Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: todayWidth }]} />
      </View>

      {bestGroup ? (
        <Pressable
          style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}
          onPress={openGroup}
          accessibilityRole="button"
          accessibilityLabel={`Open ${bestGroup.group_name} leaderboard`}
        >
          <View style={styles.groupIcon}>
            <Trophy size={18} color={ACCENT} />
          </View>

          <View style={styles.groupText}>
            <Text style={styles.groupTitle} numberOfLines={1}>
              #{bestGroup.my_rank} in {bestGroup.group_name}
            </Text>
            <Text style={styles.groupSubtitle} numberOfLines={1}>
              {bestGroup.points_to_next != null
                ? `${bestGroup.points_to_next} pts to move up`
                : bestGroup.member_count > 1
                  ? "You're leading this week"
                  : "Invite friends to compete"}
              {groupCount > 1 ? ` · ${groupCount} groups` : ""}
            </Text>
          </View>

          <ChevronRight size={20} color={ACCENT} />
        </Pressable>
      ) : (
        <Text style={styles.hint}>
          Create or join a group in Friends to compete on the weekly
          leaderboard.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 24,
  },
  eyebrow: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  stat: {
    flex: 1,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
  },
  statUnit: {
    color: MUTED,
    fontSize: 14,
    fontWeight: "600",
  },
  accent: {
    color: ACCENT,
  },
  statLabel: {
    color: MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  track: {
    height: 8,
    borderRadius: 8,
    backgroundColor: BORDER,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 8,
    backgroundColor: ACCENT,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252D20",
    borderRadius: 16,
    padding: 12,
    marginTop: 16,
  },
  pressed: {
    opacity: 0.75,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#1F2619",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  groupText: {
    flex: 1,
  },
  groupTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  groupSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },
  hint: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 16,
  },
});
