import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";

import { getCurrentUser, isProfileComplete } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { usePostHog } from "posthog-react-native";

type FoodLog = {
  id: string;
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  log_date: string;
};

type DaySummary = {
  date: string;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

const COLORS = {
  background: "#101010",
  card: "#1A1A1A",
  elevated: "#222222",
  accent: "#B6F36B",
  text: "#FFFFFF",
  secondary: "#A0A0A0",
  muted: "#707070",
  border: "#303030",
};

const getDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { weekday: "short" });

const formatDateLabel = (dateString: string) => {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const getBarHeight = (calories: number, maxCalories: number) => {
  if (maxCalories <= 0 || calories <= 0) return 3;

  return Math.max(3, (calories / maxCalories) * 150);
};

const formatNumber = (value: number) =>
  Math.round(value).toLocaleString("en-IN");

export default function HistoryScreen() {
  const posthog = usePostHog();
  
  const [days, setDays] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyGoal, setDailyGoal] = useState<number | null>(null);
  const [showDailyCalories, setShowDailyCalories] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<
    "calories" | "protein" | "carbs" | "fat"
  >("calories");

  const loadHistory = async () => {
    setLoading(true);

    try {
      const user = await getCurrentUser();

      if (!user) {
        setDays([]);
        setDailyGoal(null);
        return;
      }

      const profileComplete = await isProfileComplete(user.id);

      if (!profileComplete) {
        setDays([]);
        setDailyGoal(null);
        return;
      }

      const today = new Date();
      const dates: Date[] = [];

      for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(date);
      }

      const startDate = getDateString(dates[0]);
      const endDate = getDateString(dates[dates.length - 1]);

      const { data: foodLogs, error: foodError } = await supabase
        .from("food_logs")
        .select(
          "id, food_name, quantity, unit, calories, protein, carbs, fat, fiber, log_date",
        )
        .eq("user_id", user.id)
        .gte("log_date", startDate)
        .lte("log_date", endDate)
        .order("log_date", { ascending: true });

      if (foodError) {
        console.error("Failed to load history:", foodError);
        setDays([]);
        return;
      }

      const { data: goalData, error: goalError } = await supabase
        .from("calorie_goals")
        .select("daily_calories")
        .eq("user_id", user.id)
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (goalError) {
        console.error("Failed to load calorie goal:", goalError);
      }

      setDailyGoal(
        goalData?.daily_calories != null
          ? Number(goalData.daily_calories)
          : null,
      );

      const logs = (foodLogs ?? []) as FoodLog[];

      const summaries: DaySummary[] = dates.map((date) => {
        const dateString = getDateString(date);
        const dayLogs = logs.filter((food) => food.log_date === dateString);

        return {
          date: dateString,
          label: formatDayLabel(date),
          calories: dayLogs.reduce(
            (sum, food) => sum + Number(food.calories || 0),
            0,
          ),
          protein: dayLogs.reduce(
            (sum, food) => sum + Number(food.protein || 0),
            0,
          ),
          carbs: dayLogs.reduce(
            (sum, food) => sum + Number(food.carbs || 0),
            0,
          ),
          fat: dayLogs.reduce(
            (sum, food) => sum + Number(food.fat || 0),
            0,
          ),
          fiber: dayLogs.reduce(
            (sum, food) => sum + Number(food.fiber || 0),
            0,
          ),
        };
      });

      setDays(summaries);
    } catch (error) {
      console.error("Failed to load history:", error);
      setDays([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      posthog.capture("history_viewed");
      void loadHistory();
    }, [posthog]),
  );

  const maxCalories = Math.max(
    dailyGoal ?? 0,
    ...days.map((day) => day.calories),
    1,
  );

  const totalCalories = days.reduce((sum, day) => sum + day.calories, 0);
  const totalProtein = days.reduce((sum, day) => sum + day.protein, 0);
  const totalCarbs = days.reduce((sum, day) => sum + day.carbs, 0);
  const totalFat = days.reduce((sum, day) => sum + day.fat, 0);
  const totalFiber = days.reduce((sum, day) => sum + day.fiber, 0);

  const averageCalories = days.length ? totalCalories / days.length : 0;
  const averageProtein = days.length ? totalProtein / days.length : 0;

  const daysWithinGoal =
    dailyGoal !== null
      ? days.filter((day) => day.calories > 0 && day.calories <= dailyGoal)
          .length
      : 0;

  const metricConfig = {
    calories: {
      label: "Calories",
      unit: "kcal",
      color: COLORS.accent,
      value: (day: DaySummary) => day.calories,
    },
    protein: {
      label: "Protein",
      unit: "g",
      color: "#83B9FF",
      value: (day: DaySummary) => day.protein,
    },
    carbs: {
      label: "Carbs",
      unit: "g",
      color: "#F6C76A",
      value: (day: DaySummary) => day.carbs,
    },
    fat: {
      label: "Fat",
      unit: "g",
      color: "#E7A0FF",
      value: (day: DaySummary) => day.fat,
    },
  } as const;

  const selectedValues = days.map((day) =>
    metricConfig[selectedMetric].value(day),
  );
  const maxMetric = Math.max(...selectedValues, 1);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading your history...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR PROGRESS</Text>
          <Text style={styles.title}>History</Text>
          <Text style={styles.subtitle}>Your last 7 days at a glance.</Text>
        </View>

        <View style={styles.headerIcon}>
          <Text style={styles.headerIconText}>↗</Text>
        </View>
      </View>

      <View style={styles.periodRow}>
        <View style={styles.periodPill}>
          <View style={styles.statusDot} />
          <Text style={styles.periodText}>LAST 7 DAYS</Text>
        </View>

        <Text style={styles.periodDates}>
          {formatDateLabel(days[0]?.date ?? getDateString(new Date()))}
          {" – "}
          {formatDateLabel(days[days.length - 1]?.date ?? getDateString(new Date()))}
        </Text>
      </View>

      {dailyGoal !== null && (
        <View style={styles.goalCard}>
          <View style={styles.goalTopRow}>
            <View>
              <Text style={styles.cardEyebrow}>DAILY CALORIE GOAL</Text>
              <Text style={styles.goalValue}>
                {formatNumber(dailyGoal)}
                <Text style={styles.goalUnit}> kcal</Text>
              </Text>
            </View>

            <View style={styles.goalIcon}>
              <Text style={styles.goalIconText}>◎</Text>
            </View>
          </View>

          <View style={styles.goalTrack}>
            <View
              style={[
                styles.goalProgress,
                {
                  width: `${
                    dailyGoal > 0
                      ? Math.min(
                          100,
                          (averageCalories / dailyGoal) * 100,
                        )
                      : 0
                  }%`,
                },
              ]}
            />
          </View>

          <Text style={styles.goalFootnote}>
            Your 7-day average is {formatNumber(averageCalories)} kcal/day
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your activity</Text>
            <Text style={styles.sectionSubtitle}>
              Track your daily intake
            </Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.metricTabs}>
            {(["calories", "protein", "carbs", "fat"] as const).map(
              (metric) => {
                const active = selectedMetric === metric;

                return (
                  <Pressable
                    key={metric}
                    onPress={() => setSelectedMetric(metric)}
                    style={[
                      styles.metricTab,
                      active && styles.metricTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.metricTabText,
                        active && styles.metricTabTextActive,
                      ]}
                    >
                      {metricConfig[metric].label}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </View>

          <View style={styles.chartSummary}>
            <Text style={styles.chartTotal}>
              {formatNumber(
                days.reduce(
                  (sum, day) =>
                    sum + metricConfig[selectedMetric].value(day),
                  0,
                ),
              )}
              <Text style={styles.chartUnit}>
                {" "}
                {metricConfig[selectedMetric].unit}
              </Text>
            </Text>

            <Text style={styles.chartCaption}>TOTAL THIS WEEK</Text>
          </View>

          <View style={styles.chart}>
            {days.map((day) => {
              const value = metricConfig[selectedMetric].value(day);
              const barHeight = getBarHeight(value, maxMetric);
              const isToday = day.date === getDateString(new Date());

              return (
                <View key={day.date} style={styles.barColumn}>
                  <Text style={styles.barValue}>
                    {value >= 1000
                      ? `${(value / 1000).toFixed(1)}k`
                      : formatNumber(value)}
                  </Text>

                  <View style={styles.barArea}>
                    {selectedMetric === "calories" &&
                      dailyGoal !== null &&
                      dailyGoal <= maxMetric && (
                        <View
                          style={[
                            styles.goalLine,
                            {
                              bottom: Math.min(
                                150,
                                (dailyGoal / maxMetric) * 150,
                              ),
                            },
                          ]}
                        />
                      )}

                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: metricConfig[selectedMetric].color,
                          opacity: value > 0 ? 1 : 0.25,
                        },
                        isToday && styles.todayBar,
                      ]}
                    />
                  </View>

                  <Text
                    style={[
                      styles.barLabel,
                      isToday && styles.todayBarLabel,
                    ]}
                  >
                    {day.label}
                  </Text>
                  {isToday && <View style={styles.todayDot} />}
                </View>
              );
            })}
          </View>

          {selectedMetric === "calories" && dailyGoal !== null && (
            <View style={styles.legend}>
              <View style={styles.legendLine} />
              <Text style={styles.legendText}>
                Daily goal · {formatNumber(dailyGoal)} kcal
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Weekly overview</Text>
        <Text style={styles.sectionSubtitle}>
          Your averages and consistency
        </Text>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryCardTop}>
              <Text style={styles.summaryLabel}>Avg. calories</Text>
              <View
                style={[
                  styles.summaryDot,
                  { backgroundColor: COLORS.accent },
                ]}
              />
            </View>
            <Text style={styles.summaryValue}>
              {formatNumber(averageCalories)}
            </Text>
            <Text style={styles.summaryUnit}>kcal / day</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCardTop}>
              <Text style={styles.summaryLabel}>Avg. protein</Text>
              <View
                style={[
                  styles.summaryDot,
                  { backgroundColor: "#83B9FF" },
                ]}
              />
            </View>
            <Text style={styles.summaryValue}>
              {formatNumber(averageProtein)}
              <Text style={styles.summaryInlineUnit}> g</Text>
            </Text>
            <Text style={styles.summaryUnit}>per day</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCardTop}>
              <Text style={styles.summaryLabel}>Within goal</Text>
              <View
                style={[
                  styles.summaryDot,
                  { backgroundColor: "#F6C76A" },
                ]}
              />
            </View>
            <Text style={styles.summaryValue}>
              {daysWithinGoal}
              <Text style={styles.summaryInlineUnit}> / 7</Text>
            </Text>
            <Text style={styles.summaryUnit}>logged days in range</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCardTop}>
              <Text style={styles.summaryLabel}>Total calories</Text>
              <View
                style={[
                  styles.summaryDot,
                  { backgroundColor: "#E7A0FF" },
                ]}
              />
            </View>
            <Text style={styles.summaryValue}>
              {formatNumber(totalCalories)}
            </Text>
            <Text style={styles.summaryUnit}>kcal this week</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Macro breakdown</Text>
        <Text style={styles.sectionSubtitle}>
          Total intake over the last 7 days
        </Text>

        <View style={styles.macroCard}>
          <MacroRow
            label="Protein"
            value={totalProtein}
            color="#83B9FF"
            maxValue={Math.max(totalProtein, totalCarbs, totalFat, 1)}
          />
          <MacroRow
            label="Carbs"
            value={totalCarbs}
            color="#F6C76A"
            maxValue={Math.max(totalProtein, totalCarbs, totalFat, 1)}
          />
          <MacroRow
            label="Fat"
            value={totalFat}
            color="#E7A0FF"
            maxValue={Math.max(totalProtein, totalCarbs, totalFat, 1)}
          />
          <MacroRow
            label="Fiber"
            value={totalFiber}
            color={COLORS.accent}
            maxValue={Math.max(totalProtein, totalCarbs, totalFat, 1)}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Pressable
          style={styles.dailyCaloriesHeader}
          onPress={() => setShowDailyCalories((current) => !current)}
        >
          <View>
            <Text style={styles.sectionTitle}>Daily breakdown</Text>
            <Text style={styles.sectionSubtitle}>
              Calories logged each day
            </Text>
          </View>

          <View style={styles.expandPill}>
            <Text style={styles.expandButton}>
              {showDailyCalories ? "Hide －" : "View ＋"}
            </Text>
          </View>
        </Pressable>

        {showDailyCalories &&
          [...days].reverse().map((day) => {
            const isToday = day.date === getDateString(new Date());
            const hasLoggedFood = day.calories > 0;
            const goalProgress =
              dailyGoal && dailyGoal > 0
                ? Math.min(100, (day.calories / dailyGoal) * 100)
                : 0;

            return (
              <View
                key={day.date}
                style={[
                  styles.dayCard,
                  isToday && styles.todayCard,
                ]}
              >
                <View style={styles.dayTopRow}>
                  <View style={styles.dayDateGroup}>
                    <View
                      style={[
                        styles.dayIcon,
                        hasLoggedFood && styles.dayIconActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayIconText,
                          hasLoggedFood && styles.dayIconTextActive,
                        ]}
                      >
                        {hasLoggedFood ? "✓" : "·"}
                      </Text>
                    </View>

                    <View>
                      <View style={styles.dayTitleRow}>
                        <Text style={styles.dayLabel}>
                          {isToday ? "Today" : day.label}
                        </Text>
                        {isToday && (
                          <View style={styles.todayPill}>
                            <Text style={styles.todayPillText}>TODAY</Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.dateLabel}>
                        {formatDateLabel(day.date)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dayCaloriesGroup}>
                    <Text style={styles.calorieValue}>
                      {formatNumber(day.calories)}
                    </Text>
                    <Text style={styles.dayKcalLabel}>kcal</Text>
                  </View>
                </View>

                {dailyGoal !== null && (
                  <View style={styles.dayProgressTrack}>
                    <View
                      style={[
                        styles.dayProgress,
                        { width: `${goalProgress}%` },
                      ]}
                    />
                  </View>
                )}

                <View style={styles.dayMacros}>
                  <Text style={styles.dayMacroText}>
                    P <Text style={styles.dayMacroValue}>{formatNumber(day.protein)}g</Text>
                  </Text>
                  <Text style={styles.macroSeparator}>·</Text>
                  <Text style={styles.dayMacroText}>
                    C <Text style={styles.dayMacroValue}>{formatNumber(day.carbs)}g</Text>
                  </Text>
                  <Text style={styles.macroSeparator}>·</Text>
                  <Text style={styles.dayMacroText}>
                    F <Text style={styles.dayMacroValue}>{formatNumber(day.fat)}g</Text>
                  </Text>
                  <Text style={styles.macroSeparator}>·</Text>
                  <Text style={styles.dayMacroText}>
                    Fiber <Text style={styles.dayMacroValue}>{formatNumber(day.fiber)}g</Text>
                  </Text>
                </View>
              </View>
            );
          })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Small steps. Consistent progress.
        </Text>
      </View>
    </ScrollView>
  );
}

function MacroRow({
  label,
  value,
  color,
  maxValue,
}: {
  label: string;
  value: number;
  color: string;
  maxValue: number;
}) {
  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <View style={styles.macroRow}>
      <View style={styles.macroRowTop}>
        <View style={styles.macroLabelGroup}>
          <View style={[styles.macroColorDot, { backgroundColor: color }]} />
          <Text style={styles.macroLabel}>{label}</Text>
        </View>

        <Text style={styles.macroAmount}>
          {formatNumber(value)}
          <Text style={styles.macroUnit}> g</Text>
        </Text>
      </View>

      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            { width: `${percentage}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 44,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.secondary,
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 7,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    color: COLORS.secondary,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#252D1C",
    borderWidth: 1,
    borderColor: "#3C4B2B",
  },
  headerIconText: {
    color: COLORS.accent,
    fontSize: 27,
    fontWeight: "700",
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 18,
  },
  periodPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#202719",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginRight: 7,
  },
  periodText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  periodDates: {
    color: COLORS.secondary,
    fontSize: 11,
  },
  goalCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  goalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardEyebrow: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  goalValue: {
    marginTop: 7,
    color: COLORS.text,
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  goalUnit: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: "500",
  },
  goalIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
  },
  goalIconText: {
    fontSize: 28,
    color: COLORS.accent,
  },
  goalTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: "#333333",
    marginTop: 18,
    overflow: "hidden",
  },
  goalProgress: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  goalFootnote: {
    marginTop: 10,
    fontSize: 12,
    color: COLORS.secondary,
  },
  section: {
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: COLORS.secondary,
    fontSize: 12,
    marginTop: 5,
    marginBottom: 14,
  },
  chartCard: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricTabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 11,
    backgroundColor: "#111111",
    marginBottom: 20,
  },
  metricTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  metricTabActive: {
    backgroundColor: "#2A3420",
  },
  metricTabText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  metricTabTextActive: {
    color: COLORS.accent,
    fontWeight: "800",
  },
  chartSummary: {
    marginBottom: 16,
  },
  chartTotal: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "800",
  },
  chartUnit: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "500",
  },
  chartCaption: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 3,
  },
  chart: {
    height: 202,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  barColumn: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barValue: {
    marginBottom: 7,
    fontSize: 9,
    color: COLORS.secondary,
    fontWeight: "600",
  },
  barArea: {
    width: 25,
    height: 150,
    justifyContent: "flex-end",
    position: "relative",
  },
  bar: {
    width: "100%",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  todayBar: {
    borderWidth: 1,
    borderColor: "#E0FFB5",
  },
  goalLine: {
    position: "absolute",
    left: -6,
    right: -6,
    height: 1,
    backgroundColor: "#777777",
    zIndex: 2,
  },
  barLabel: {
    marginTop: 8,
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
  },
  todayBarLabel: {
    color: COLORS.accent,
    fontWeight: "800",
  },
  todayDot: {
    marginTop: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 17,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendLine: {
    width: 18,
    height: 2,
    backgroundColor: "#777777",
    marginRight: 8,
  },
  legendText: {
    color: COLORS.secondary,
    fontSize: 11,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  summaryCard: {
    width: "48%",
    minHeight: 122,
    marginBottom: 12,
    padding: 15,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
  },
  summaryCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  summaryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 12,
    letterSpacing: -0.4,
  },
  summaryInlineUnit: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "600",
  },
  summaryUnit: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 4,
  },
  macroCard: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  macroRow: {
    marginBottom: 19,
  },
  macroRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  macroLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  macroColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 9,
  },
  macroLabel: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: "600",
  },
  macroAmount: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  macroUnit: {
    color: COLORS.secondary,
    fontWeight: "500",
    fontSize: 11,
  },
  macroTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: "#333333",
    overflow: "hidden",
  },
  macroFill: {
    height: "100%",
    borderRadius: 4,
  },
  dailyCaloriesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expandPill: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: COLORS.elevated,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  expandButton: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  dayCard: {
    marginBottom: 10,
    padding: 15,
    borderRadius: 15,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  todayCard: {
    borderColor: "#52663A",
    backgroundColor: "#191E15",
  },
  dayTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayDateGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dayIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: COLORS.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  dayIconActive: {
    backgroundColor: "#29351F",
  },
  dayIconText: {
    color: COLORS.muted,
    fontSize: 19,
    fontWeight: "700",
  },
  dayIconTextActive: {
    color: COLORS.accent,
  },
  dayTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  dayLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  todayPill: {
    marginLeft: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "#2B3820",
  },
  todayPillText: {
    color: COLORS.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  dateLabel: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.secondary,
  },
  dayCaloriesGroup: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  calorieValue: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "800",
  },
  dayKcalLabel: {
    color: COLORS.secondary,
    fontSize: 10,
    marginTop: 2,
  },
  dayProgressTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: "#333333",
    marginTop: 15,
    overflow: "hidden",
  },
  dayProgress: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  dayMacros: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 12,
  },
  dayMacroText: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: "600",
  },
  dayMacroValue: {
    color: COLORS.text,
    fontWeight: "700",
  },
  macroSeparator: {
    color: COLORS.muted,
    marginHorizontal: 7,
    fontSize: 12,
  },
  footer: {
    alignItems: "center",
    paddingTop: 18,
    paddingBottom: 4,
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});