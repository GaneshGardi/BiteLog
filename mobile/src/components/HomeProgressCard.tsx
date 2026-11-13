import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, Flame, Trophy, Info } from "lucide-react-native";

import AppModal from "./AppModal";
import {
  DAILY_POINT_CAP,
  TARGET_RANGE_LABEL,
  type GamificationSummary,
} from "../lib/gamification";
import { colors } from "../constants/palette";

const CARD = colors.card;
const ACCENT = colors.accent;
const MUTED = colors.muted;
const BORDER = colors.border;
const TEXT = colors.text;
const FLAME = colors.warm;
const ON_ACCENT = colors.onAccent;

type Props = {
  summary: GamificationSummary;
};

export default function HomeProgressCard({ summary }: Props) {
  const { todayPoints, weekPoints, currentStreak, bestGroup, groupCount } =
    summary;

  const [rulesVisible, setRulesVisible] = useState(false);

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
    <>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => setRulesVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="View how the points system works"
      >
        <View style={styles.eyebrowRow}>
          <Text style={styles.eyebrow}>YOUR WEEK</Text>
          <View style={styles.infoChip}>
            <Info size={13} color={colors.accentInk} />
            <Text style={styles.infoChipText}>How points work</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <View style={styles.statValueRow}>
              <Flame
                size={20}
                color={currentStreak > 0 ? FLAME : MUTED}
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
            onPress={(e) => {
              // Don't open the rules modal when tapping the group row
              e?.stopPropagation?.();
              openGroup();
            }}
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
      </Pressable>

      {/* Points system explanation */}
      <AppModal
        visible={rulesVisible}
        onClose={() => setRulesVisible(false)}
        title="How points work"
        subtitle="Earn points every day by logging food and staying near your calorie goal."
        presentation="bottom"
        closeOnBackdropPress
        footer={
          <Pressable
            style={({ pressed }) => [
              styles.gotItButton,
              pressed && styles.pressed,
            ]}
            onPress={() => setRulesVisible(false)}
          >
            <Text style={styles.gotItText}>Got it</Text>
          </Pressable>
        }
      >
        <View style={styles.rulesList}>
          <View style={styles.ruleRow}>
            <View style={styles.ruleBadge}>
              <Text style={styles.rulePoints}>+2</Text>
            </View>
            <View style={styles.ruleBody}>
              <Text style={styles.ruleTitle}>Log food</Text>
              <Text style={styles.ruleText}>Log at least 1 food today</Text>
            </View>
          </View>

          <View style={styles.ruleRow}>
            <View style={styles.ruleBadge}>
              <Text style={styles.rulePoints}>+3</Text>
            </View>
            <View style={styles.ruleBody}>
              <Text style={styles.ruleTitle}>Stay consistent</Text>
              <Text style={styles.ruleText}>Log at least 3 foods today</Text>
            </View>
          </View>

          <View style={styles.ruleRow}>
            <View style={[styles.ruleBadge, styles.ruleBadgeHighlight]}>
              <Text style={[styles.rulePoints, styles.rulePointsHighlight]}>
                +10
              </Text>
            </View>
            <View style={styles.ruleBody}>
              <Text style={styles.ruleTitle}>Hit your target</Text>
              <Text style={styles.ruleText}>
                Eat {TARGET_RANGE_LABEL} of your daily calorie goal
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.rulesFooterCard}>
          <Text style={styles.rulesFooterLine}>
            Maximum {DAILY_POINT_CAP} points per day
          </Text>
          <Text style={styles.rulesFooterLine}>
            Streaks grow when you stay in the {TARGET_RANGE_LABEL} range
          </Text>
          <Text style={styles.rulesFooterLine}>
            Weekly scores reset every Monday
          </Text>
        </View>
      </AppModal>
    </>
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
  cardPressed: {
    opacity: 0.92,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  eyebrow: {
    color: colors.accentInk,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  infoChipText: {
    color: colors.accentInk,
    fontSize: 11,
    fontWeight: "700",
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
    color: TEXT,
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
    backgroundColor: colors.accentSoft,
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
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  groupText: {
    flex: 1,
  },
  groupTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "700",
  },
  groupSubtitle: {
    color: MUTED,
    fontSize: 12,
    marginTop: 3,
  },
  hint: {
    marginTop: 14,
    color: MUTED,
    fontSize: 12,
    lineHeight: 18,
  },

  /* Modal content */
  rulesList: {
    gap: 14,
    marginBottom: 18,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  ruleBadge: {
    minWidth: 48,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  ruleBadgeHighlight: {
    backgroundColor: ACCENT,
  },
  rulePoints: {
    color: colors.accentInk,
    fontSize: 16,
    fontWeight: "900",
  },
  rulePointsHighlight: {
    color: ON_ACCENT,
  },
  ruleBody: {
    flex: 1,
  },
  ruleTitle: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "800",
  },
  ruleText: {
    color: MUTED,
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  rulesFooterCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  rulesFooterLine: {
    color: colors.accentInk,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  gotItButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  gotItText: {
    color: ON_ACCENT,
    fontSize: 15,
    fontWeight: "900",
  },
});
