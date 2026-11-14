import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getCurrentUser } from "../lib/auth";
import {
  DAILY_POINT_CAP,
  TARGET_RANGE_LABEL,
  fetchGroupLeaderboard,
  formatWeekRange,
  type LeaderboardEntry,
} from "../lib/gamification";
import { Sentry } from "../lib/sentry";

const ACCENT = "#B6F36B";
const CARD = "#1A1A1A";
const BORDER = "#303030";
const MUTED = "#888888";
const FLAME = "#FF9A76";

const MEDAL_COLORS: Record<number, string> = {
  1: "#F5C26B",
  2: "#C9D1D9",
  3: "#D9955B",
};

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

type Props = {
  groupId: string;
  /** Change this number to reload the leaderboard (pull-to-refresh, focus). */
  refreshKey: number;
};

export default function GroupLeaderboard({ groupId, refreshKey }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [user, rows] = await Promise.all([
          getCurrentUser(),
          fetchGroupLeaderboard(groupId),
        ]);

        if (cancelled) return;

        setCurrentUserId(user?.id ?? null);
        setEntries(rows);
        setError("");
      } catch (loadError) {
        if (cancelled) return;

        Sentry.logger.error("Group leaderboard failed to load", {
          operation: "load_group_leaderboard",
        });
        Sentry.captureException(loadError);

        setEntries([]);
        setError("Could not load the leaderboard. Pull down to retry.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [groupId, refreshKey]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={ACCENT} />
      </View>
    );
  }

  const me = entries.find((entry) => entry.user_id === currentUserId) ?? null;
  const weekStart = entries[0]?.week_start;

  // The person directly above me: the lowest score that beats mine.
  const above = me
    ? entries
        .filter((entry) => entry.week_points > me.week_points)
        .sort((a, b) => a.week_points - b.week_points)[0]
    : undefined;

  const nameOf = (entry: LeaderboardEntry) =>
    entry.display_name?.trim() || entry.username || "Member";

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Weekly leaderboard</Text>
          <Text style={styles.subtitle}>
            {weekStart ? `${formatWeekRange(weekStart)} · ` : ""}Resets Monday
          </Text>
        </View>

        <View style={styles.thisWeekBadge}>
          <Text style={styles.thisWeekText}>THIS WEEK</Text>
        </View>
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={18} color="#FF8A8A" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {me && (
        <View style={styles.gapCard}>
          <Ionicons
            name={me.rank === 1 ? "trophy" : "trending-up"}
            size={20}
            color={ACCENT}
          />
          <Text style={styles.gapText}>
            {above
              ? `${above.week_points - me.week_points} pts to pass ${nameOf(above)}`
              : entries.length > 1
                ? "You're leading this week. Keep it up!"
                : "Invite friends to start the competition."}
          </Text>
        </View>
      )}

      {entries.map((entry) => {
        const isMe = entry.user_id === currentUserId;
        const medalColor = MEDAL_COLORS[entry.rank];
        const name = nameOf(entry);

        return (
          <View
            key={entry.user_id}
            style={[styles.row, isMe && styles.rowMe]}
            accessible
            accessibilityLabel={`Rank ${entry.rank}, ${name}${
              isMe ? " (you)" : ""
            }, ${entry.week_points} points this week, ${
              entry.current_streak
            } day streak`}
          >
            <View style={styles.rankSlot}>
              {medalColor ? (
                <Ionicons name="medal" size={24} color={medalColor} />
              ) : (
                <Text style={styles.rankNumber}>{entry.rank}</Text>
              )}
            </View>

            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name.charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {isMe && (
                  <View style={styles.youBadge}>
                    <Text style={styles.youText}>YOU</Text>
                  </View>
                )}
              </View>

              <View style={styles.streakRow}>
                <Ionicons
                  name="flame"
                  size={13}
                  color={entry.current_streak > 0 ? FLAME : "#555555"}
                />
                <Text
                  style={[
                    styles.streakText,
                    entry.current_streak > 0 && styles.streakTextActive,
                  ]}
                >
                  {entry.current_streak}-day streak
                </Text>
              </View>

              <View style={styles.dotsRow}>
                {entry.day_points.map((points, index) => (
                  <View key={index} style={styles.dotColumn}>
                    <View
                      style={[
                        styles.dot,
                        points > 0 && styles.dotActive,
                        points >= 10 && styles.dotTarget,
                      ]}
                    />
                    <Text style={styles.dotLabel}>{DAY_LETTERS[index]}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.pointsColumn}>
              <Text style={[styles.points, isMe && styles.pointsMe]}>
                {entry.week_points}
              </Text>
              <Text style={styles.pointsLabel}>pts</Text>
              {entry.today_points > 0 && (
                <Text style={styles.todayPoints}>+{entry.today_points} today</Text>
              )}
            </View>
          </View>
        );
      })}

      <View style={styles.rulesCard}>
        <Text style={styles.rulesTitle}>How points work</Text>

        <View style={styles.ruleRow}>
          <Text style={styles.rulePoints}>+2</Text>
          <Text style={styles.ruleText}>Log at least 1 food</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.rulePoints}>+3</Text>
          <Text style={styles.ruleText}>Log at least 3 foods</Text>
        </View>
        <View style={styles.ruleRow}>
          <Text style={styles.rulePoints}>+10</Text>
          <Text style={styles.ruleText}>
            Eat {TARGET_RANGE_LABEL} of your daily calorie goal
          </Text>
        </View>

        <Text style={styles.rulesFooter}>
          Maximum {DAILY_POINT_CAP} points per day. Scores reset every Monday.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: 40,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerText: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  subtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
  },
  thisWeekBadge: {
    backgroundColor: "#252D20",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  thisWeekText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#2A1B1B",
    borderWidth: 1,
    borderColor: "#553030",
    padding: 13,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: "#FFAAAA",
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
  gapCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#46543A",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  gapText: {
    flex: 1,
    color: ACCENT,
    fontSize: 14,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
  },
  rowMe: {
    borderColor: ACCENT,
  },
  rankSlot: {
    width: 30,
    alignItems: "center",
    marginRight: 8,
  },
  rankNumber: {
    color: MUTED,
    fontSize: 18,
    fontWeight: "800",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#46543A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 17,
    fontWeight: "800",
    color: ACCENT,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  youBadge: {
    backgroundColor: ACCENT,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  youText: {
    color: "#101010",
    fontSize: 10,
    fontWeight: "800",
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  streakText: {
    color: "#777777",
    fontSize: 12,
  },
  streakTextActive: {
    color: FLAME,
    fontWeight: "700",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 10,
  },
  dotColumn: {
    alignItems: "center",
    gap: 3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BORDER,
  },
  dotActive: {
    backgroundColor: "#46543A",
  },
  dotTarget: {
    backgroundColor: ACCENT,
  },
  dotLabel: {
    color: "#666666",
    fontSize: 9,
    fontWeight: "700",
  },
  pointsColumn: {
    alignItems: "flex-end",
    marginLeft: 8,
    minWidth: 54,
  },
  points: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  pointsMe: {
    color: ACCENT,
  },
  pointsLabel: {
    color: MUTED,
    fontSize: 12,
  },
  todayPoints: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  rulesCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginTop: 4,
    marginBottom: 20,
  },
  rulesTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  rulePoints: {
    width: 40,
    color: ACCENT,
    fontSize: 14,
    fontWeight: "800",
  },
  ruleText: {
    flex: 1,
    color: "#BBBBBB",
    fontSize: 13,
  },
  rulesFooter: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },
});
