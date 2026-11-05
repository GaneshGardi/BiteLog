
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { supabase } from "../lib/supabase";

type WeeklyHistoryRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  log_date: string;
  calories_consumed: number | string;
  daily_calorie_goal: number | string | null;
};

type GroupWeeklyHistoryProps = {
  groupId: string;
  refreshToken: number;
  memberId: string;
};

const C = {
  background: "#101010",
  card: "#1A1A1A",
  elevated: "#222222",
  accent: "#B6F36B",
  text: "#FFFFFF",
  secondary: "#999999",
  muted: "#707070",
  border: "#303030",
  goal: "#D8B66A",
  danger: "#FF7777",
};

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDateLabel = (dateString: string) => {
  // Noon avoids timezone shifts around midnight.
  const date = new Date(`${dateString}T12:00:00`);

  return {
    weekday: date.toLocaleDateString(undefined, {
      weekday: "short",
    }),
    date: date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
    fullDate: date.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  };
};

const getCalories = (
  value: number | string | null | undefined
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const formatCalories = (value: number) =>
  Math.round(value).toLocaleString();

const formatCompactCalories = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return Math.round(value).toString();
};

export default function GroupWeeklyHistory({
  groupId,
  refreshToken,
  memberId,
}: GroupWeeklyHistoryProps) {
  const [history, setHistory] = useState<WeeklyHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    if (!groupId || !memberId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const today = new Date();
      const endDate = getLocalDateString(today);

      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      const startDate = getLocalDateString(start);

      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Asia/Kolkata";

      const { data, error: fetchError } = await supabase.rpc(
        "get_group_weekly_history",
        {
          p_group_id: groupId,
          p_start_date: startDate,
          p_end_date: endDate,
          p_timezone: timezone,
        }
      );

      if (fetchError) throw fetchError;

      const rows = (data ?? []) as WeeklyHistoryRow[];

      setHistory(
        rows
          .filter((row) => row.user_id === memberId)
          .slice()
          .sort((a, b) =>
            a.log_date.localeCompare(b.log_date)
          )
      );
    } catch (err) {
      console.error("Failed to load member weekly history:", err);
      setHistory([]);
      setError(
        "Couldn't load weekly history. Refresh and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [groupId, memberId]);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory, refreshToken])
  );

  const selectedDays = history;
  const selectedMember = selectedDays[0];

  const totalCalories = selectedDays.reduce(
    (sum, day) =>
      sum + getCalories(day.calories_consumed),
    0
  );

  const averageCalories =
    selectedDays.length > 0
      ? totalCalories / selectedDays.length
      : 0;

  const chartMaximum = Math.max(
    1,
    ...selectedDays.flatMap((day) => [
      getCalories(day.calories_consumed),
      getCalories(day.daily_calorie_goal),
    ])
  );

  const initials = selectedMember
    ? (
        selectedMember.display_name?.trim() ||
        selectedMember.username ||
        "?"
      )
        .charAt(0)
        .toUpperCase()
    : "?";

  const firstDate = selectedDays[0]?.log_date;
  const lastDate = selectedDays[selectedDays.length - 1]?.log_date;

  const dateRange =
    firstDate && lastDate
      ? `${getDateLabel(firstDate).date} – ${getDateLabel(lastDate).date}`
      : "Last 7 days";

  return (
    <View style={styles.section}>
      {/* Section heading */}
      <View style={styles.headingRow}>
        <View style={styles.headingText}>
          <View style={styles.eyebrowRow}>
            <View style={styles.liveDot} />
            <Text style={styles.eyebrow}>GROUP ACTIVITY</Text>
          </View>

          <Text style={styles.sectionTitle}>
            Weekly history
          </Text>

          <Text style={styles.subtitle}>
            {dateRange} · Calories only
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh weekly history"
          style={({ pressed }) => [
            styles.refreshButton,
            pressed && styles.pressed,
            loading && styles.disabled,
          ]}
          onPress={() => void loadHistory()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator
              color={C.accent}
              size="small"
            />
          ) : (
            <Ionicons
              name="refresh-outline"
              size={19}
              color={C.accent}
            />
          )}
        </Pressable>
      </View>

      {/* Loading state */}
      {loading ? (
        <View style={styles.statusCard}>
          <ActivityIndicator
            color={C.accent}
            size="large"
          />

          <Text style={styles.statusTitle}>
            Loading history
          </Text>

          <Text style={styles.muted}>
            Fetching the latest weekly calorie data.
          </Text>
        </View>
      ) : error ? (
        /* Error state */
        <View style={styles.statusCard}>
          <View style={styles.statusIconError}>
            <Ionicons
              name="alert-circle-outline"
              size={25}
              color={C.danger}
            />
          </View>

          <Text style={styles.statusTitle}>
            Something went wrong
          </Text>

          <Text style={styles.errorText}>{error}</Text>

          <Pressable
            style={styles.retryButton}
            onPress={() => void loadHistory()}
          >
            <Ionicons
              name="refresh-outline"
              size={16}
              color={C.background}
            />

            <Text style={styles.retryText}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : !selectedMember ? (
        /* Empty state */
        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Ionicons
              name="bar-chart-outline"
              size={27}
              color={C.accent}
            />
          </View>

          <Text style={styles.statusTitle}>
            No history yet
          </Text>

          <Text style={styles.muted}>
            Weekly calorie history will appear here when data
            is available for this member.
          </Text>

          <Pressable
            style={styles.retryButton}
            onPress={() => void loadHistory()}
          >
            <Ionicons
              name="refresh-outline"
              size={16}
              color={C.background}
            />

            <Text style={styles.retryText}>
              Refresh
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Member overview */}
          <View style={styles.summaryCard}>
            <View style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {initials}
                </Text>
              </View>

              <View style={styles.memberInfo}>
                <Text style={styles.summaryName}>
                  {selectedMember.display_name?.trim() ||
                    selectedMember.username}
                </Text>

                <Text style={styles.summaryUsername}>
                  @{selectedMember.username}
                </Text>
              </View>

              <View style={styles.weekBadge}>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={C.accent}
                />

                <Text style={styles.weekBadgeText}>
                  7 DAYS
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={styles.statLabel}>
                  TOTAL CONSUMED
                </Text>

                <Text style={styles.statValue}>
                  {formatCalories(totalCalories)}
                </Text>

                <Text style={styles.statUnit}>
                  kcal this week
                </Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.summaryStat}>
                <Text style={styles.statLabel}>
                  DAILY AVERAGE
                </Text>

                <Text style={styles.statValue}>
                  {formatCalories(averageCalories)}
                </Text>

                <Text style={styles.statUnit}>
                  kcal per recorded day
                </Text>
              </View>
            </View>
          </View>

          {/* Weekly chart */}
          <View style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={styles.chartHeadingText}>
                <Text style={styles.chartTitle}>
                  Daily calories
                </Text>

                <Text style={styles.chartSubtitle}>
                  Intake compared with daily goal
                </Text>
              </View>

              <View style={styles.chartIcon}>
                <Ionicons
                  name="stats-chart"
                  size={19}
                  color={C.accent}
                />
              </View>
            </View>

            {/* Chart legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={styles.legendBar} />
                <Text style={styles.legendText}>
                  Consumed
                </Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendGoalLine} />
                <Text style={styles.legendText}>
                  Daily goal
                </Text>
              </View>
            </View>

            {/* Bar chart */}
            <View style={styles.chart}>
              {selectedDays.map((day) => {
                const calories = getCalories(
                  day.calories_consumed
                );

                const goal =
                  day.daily_calorie_goal == null
                    ? null
                    : getCalories(day.daily_calorie_goal);

                const barHeight =
                  calories > 0
                    ? (calories / chartMaximum) * 100
                    : 3;

                const goalBottom =
                  goal !== null && goal > 0
                    ? (goal / chartMaximum) * 100
                    : null;

                const labels = getDateLabel(day.log_date);

                return (
                  <View
                    key={day.log_date}
                    style={styles.barColumn}
                  >
                    <Text
                      style={styles.barValue}
                      numberOfLines={1}
                    >
                      {formatCompactCalories(calories)}
                    </Text>

                    <View style={styles.barArea}>
                      {goalBottom !== null && (
                        <View
                          style={[
                            styles.goalLine,
                            { bottom: `${goalBottom}%` },
                          ]}
                        />
                      )}

                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(
                              3,
                              barHeight
                            )}%`,
                          },
                        ]}
                      />
                    </View>

                    <Text style={styles.weekdayLabel}>
                      {labels.weekday}
                    </Text>

                    <Text style={styles.dateLabel}>
                      {labels.date}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Daily breakdown */}
          <View style={styles.breakdownCard}>
            <View style={styles.breakdownHeader}>
              <View>
                <Text style={styles.chartTitle}>
                  Daily breakdown
                </Text>

                <Text style={styles.chartSubtitle}>
                  Calorie intake and goal progress
                </Text>
              </View>

              <View style={styles.daysBadge}>
                <Text style={styles.breakdownCount}>
                  {selectedDays.length} DAYS
                </Text>
              </View>
            </View>

            {selectedDays
              .slice()
              .reverse()
              .map((day) => {
                const calories = getCalories(
                  day.calories_consumed
                );

                const goal =
                  day.daily_calorie_goal == null
                    ? null
                    : getCalories(day.daily_calorie_goal);

                const percentage =
                  goal !== null && goal > 0
                    ? Math.round((calories / goal) * 100)
                    : null;

                const labels = getDateLabel(day.log_date);

                const metGoal =
                  percentage !== null && percentage >= 100;

                const progressWidth = `${Math.min(
                  Math.max(percentage ?? 0, 0),
                  100
                )}%` as `${number}%`;

                return (
                  <View
                    key={day.log_date}
                    style={styles.dayRow}
                  >
                    <View style={styles.dayHeader}>
                      <View style={styles.dayInfo}>
                        <Text style={styles.dayName}>
                          {labels.fullDate}
                        </Text>

                        <Text style={styles.dayGoal}>
                          {goal !== null && goal > 0
                            ? `Goal: ${formatCalories(goal)} kcal`
                            : "Daily goal not set"}
                        </Text>
                      </View>

                      <View style={styles.dayTotals}>
                        <Text style={styles.dayCalories}>
                          {formatCalories(calories)}
                        </Text>

                        <Text style={styles.dayKcal}>
                          kcal
                        </Text>
                      </View>
                    </View>

                    {goal !== null && goal > 0 && (
                      <>
                        <View style={styles.dayTrack}>
                          <View
                            style={[
                              styles.dayFill,
                              {
                                width: progressWidth,
                              },
                              metGoal && styles.dayFillMet,
                            ]}
                          />
                        </View>

                        <View style={styles.percentageRow}>
                          <Text style={styles.dayPercentage}>
                            {percentage}% of goal
                          </Text>

                          <View style={styles.goalStatusRow}>
                            <Ionicons
                              name={
                                metGoal
                                  ? "checkmark-circle"
                                  : "time-outline"
                              }
                              size={13}
                              color={
                                metGoal ? C.accent : C.goal
                              }
                            />

                            <Text
                              style={[
                                styles.goalStatus,
                                metGoal && styles.goalStatusMet,
                              ]}
                            >
                              {metGoal
                                ? "Goal reached"
                                : "In progress"}
                            </Text>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
          </View>

          {/* Privacy note */}
          <View style={styles.privacyNote}>
            <Ionicons
              name="lock-closed-outline"
              size={15}
              color={C.muted}
            />

            <Text style={styles.privacyText}>
              Weekly calorie totals only. Individual food logs
              remain private.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    paddingBottom: 20,
  },

  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 12,
  },

  headingText: {
    flex: 1,
  },

  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 7,
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.accent,
  },

  eyebrow: {
    color: C.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.6,
  },

  sectionTitle: {
    color: C.text,
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.6,
  },

  subtitle: {
    color: C.secondary,
    fontSize: 12,
    marginTop: 5,
  },

  refreshButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },

  pressed: {
    opacity: 0.7,
  },

  disabled: {
    opacity: 0.5,
  },

  statusCard: {
    padding: 26,
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
  },

  statusIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#39482A",
    alignItems: "center",
    justifyContent: "center",
  },

  statusIconError: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#301D1D",
    alignItems: "center",
    justifyContent: "center",
  },

  statusTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "800",
  },

  muted: {
    color: C.secondary,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
  },

  errorText: {
    color: C.danger,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
  },

  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: C.accent,
    marginTop: 4,
  },

  retryText: {
    color: C.background,
    fontWeight: "900",
    fontSize: 12,
  },

  // Member summary
  summaryCard: {
    padding: 17,
    backgroundColor: C.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 13,
  },

  memberRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    color: C.background,
    fontSize: 20,
    fontWeight: "900",
  },

  memberInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },

  summaryName: {
    color: C.text,
    fontSize: 15,
    fontWeight: "800",
  },

  summaryUsername: {
    color: C.secondary,
    fontSize: 11,
    marginTop: 4,
  },

  weekBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#39482A",
  },

  weekBadgeText: {
    color: C.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 17,
  },

  summaryStats: {
    flexDirection: "row",
  },

  summaryStat: {
    flex: 1,
  },

  statLabel: {
    color: C.secondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  statValue: {
    color: C.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 8,
  },

  statUnit: {
    color: C.muted,
    fontSize: 10,
    marginTop: 4,
  },

  statDivider: {
    width: 1,
    backgroundColor: C.border,
    marginHorizontal: 15,
  },

  // Chart
  chartCard: {
    backgroundColor: C.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 13,
  },

  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  chartHeadingText: {
    flex: 1,
  },

  chartTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "800",
  },

  chartSubtitle: {
    color: C.secondary,
    fontSize: 11,
    marginTop: 5,
  },

  chartIcon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#39482A",
    alignItems: "center",
    justifyContent: "center",
  },

  legendRow: {
    flexDirection: "row",
    gap: 17,
    marginTop: 19,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  legendBar: {
    width: 9,
    height: 9,
    borderRadius: 3,
    backgroundColor: C.accent,
  },

  legendGoalLine: {
    width: 14,
    height: 2,
    backgroundColor: C.goal,
  },

  legendText: {
    color: C.secondary,
    fontSize: 10,
  },

  chart: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 21,
    gap: 4,
  },

  barColumn: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },

  barValue: {
    color: C.secondary,
    fontSize: 9,
    fontWeight: "700",
    marginBottom: 7,
  },

  barArea: {
    height: 108,
    width: "100%",
    maxWidth: 31,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 7,
    overflow: "hidden",
    position: "relative",
  },

  bar: {
    width: "70%",
    backgroundColor: C.accent,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },

  goalLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.goal,
    zIndex: 1,
  },

  weekdayLabel: {
    color: C.text,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 9,
  },

  dateLabel: {
    color: C.muted,
    fontSize: 9,
    marginTop: 3,
  },

  // Daily breakdown
  breakdownCard: {
    paddingHorizontal: 16,
    paddingTop: 17,
    paddingBottom: 4,
    backgroundColor: C.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
  },

  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },

  daysBadge: {
    backgroundColor: "#252D20",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  breakdownCount: {
    color: C.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  dayRow: {
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },

  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  dayInfo: {
    flex: 1,
  },

  dayName: {
    color: C.text,
    fontSize: 12,
    fontWeight: "700",
  },

  dayGoal: {
    color: C.secondary,
    fontSize: 10,
    marginTop: 5,
  },

  dayTotals: {
    alignItems: "flex-end",
  },

  dayCalories: {
    color: C.text,
    fontSize: 16,
    fontWeight: "900",
  },

  dayKcal: {
    color: C.secondary,
    fontSize: 10,
    marginTop: 2,
  },

  dayTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: "#303030",
    overflow: "hidden",
    marginTop: 12,
  },

  dayFill: {
    height: "100%",
    borderRadius: 6,
    backgroundColor: C.goal,
  },

  dayFillMet: {
    backgroundColor: C.accent,
  },

  percentageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },

  dayPercentage: {
    color: C.secondary,
    fontSize: 10,
  },

  goalStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  goalStatus: {
    color: C.goal,
    fontSize: 10,
    fontWeight: "700",
  },

  goalStatusMet: {
    color: C.accent,
  },

  // Privacy
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 17,
    paddingHorizontal: 8,
  },

  privacyText: {
    flex: 1,
    color: C.muted,
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
  },
});
