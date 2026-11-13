import { useCallback, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppDialog } from "../../contexts/AppDialogContext";
import Svg, { Circle } from "react-native-svg";
import {
  Apple,
  ChevronRight,
  Flame,
  Leaf,
  Trash2,
  UserRound,
  Wheat,
  Beef,
  Droplets,
  Trophy,
} from "lucide-react-native";

import { getCurrentUser, isProfileComplete } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../../lib/sentry";
import HomeProgressCard from "../../components/HomeProgressCard";
import FloatingAddButton from "../../components/FloatingAddButton";
import { useReward } from "../../components/RewardContext";
import {
  DAILY_POINT_CAP,
  fetchGamificationSummary,
  type GamificationSummary,
} from "../../lib/gamification";

const BG = "#101010";
const CARD = "#1A1A1A";
const ACCENT = "#B6F36B";
const TEXT = "#FFFFFF";
const MUTED = "#999999";
const BORDER = "#303030";

type DashboardNutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type FoodLog = {
  id: string;
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
};

export default function HomeScreen() {
  const posthog = usePostHog();
  const { showDialog } = useAppDialog();
  const { showReward } = useReward();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [dailyCalories, setDailyCalories] = useState<number | null>(null);
  const [nutrition, setNutrition] = useState<DashboardNutrition>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [gamification, setGamification] = useState<GamificationSummary | null>(
    null,
  );
  const lastPointsRef = useRef<{ date: string; points: number } | null>(null);
  const hasLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const loadDashboard = useCallback(
    async (showLoader = !hasLoadedRef.current) => {
      if (isLoadingRef.current) return;

      isLoadingRef.current = true;

      if (showLoader && !hasLoadedRef.current) {
        setLoading(true);
      }

      try {
        const user = await getCurrentUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        const complete = await isProfileComplete(user.id);
        if (!complete) {
          router.replace("/onboarding");
          return;
        }

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const today = `${year}-${month}-${day}`;

        const [goalResult, foodLogsResult, gamificationSummary] =
          await Promise.all([
            supabase
              .from("calorie_goals")
              .select("daily_calories")
              .eq("user_id", user.id)
              .order("effective_at", { ascending: false })
              .limit(1)
              .maybeSingle(),

            supabase
              .from("food_logs")
              .select(
                "id, food_name, quantity, unit, calories, protein, carbs, fat, fiber",
              )
              .eq("user_id", user.id)
              .eq("log_date", today)
              .order("created_at", { ascending: false }),

            fetchGamificationSummary(user.id, today),
          ]);

        if (goalResult.error) {
          Sentry.logger.error("Failed to load calorie goal", {
            operation: "load_dashboard_goal",
          });
          Sentry.captureException(goalResult.error);
        } else {
          setDailyCalories(
            goalResult.data ? Number(goalResult.data.daily_calories) : null,
          );
        }

        if (foodLogsResult.error) {
          Sentry.logger.error("Failed to load dashboard food logs", {
            operation: "load_dashboard_food_logs",
          });
          Sentry.captureException(foodLogsResult.error);

          setFoodLogs([]);
          setNutrition({
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
          });
        } else {
          const todaysFoodLogs = foodLogsResult.data ?? [];

          setFoodLogs(
            todaysFoodLogs.map((food) => ({
              id: food.id,
              food_name: food.food_name,
              quantity: Number(food.quantity ?? 0),
              unit: food.unit ?? "g",
              calories: Number(food.calories ?? 0),
            })),
          );

          const totals = todaysFoodLogs.reduce(
            (sum, food) => ({
              calories: sum.calories + Number(food.calories ?? 0),
              protein: sum.protein + Number(food.protein ?? 0),
              carbs: sum.carbs + Number(food.carbs ?? 0),
              fat: sum.fat + Number(food.fat ?? 0),
              fiber: sum.fiber + Number(food.fiber ?? 0),
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          );

          setNutrition(totals);
        }

        // Points detection → show Winner.json reward badge (same logic as before)
        if (gamificationSummary) {
          setGamification(gamificationSummary);

          const previous = lastPointsRef.current;

          if (
            previous &&
            previous.date === today &&
            gamificationSummary.todayPoints > previous.points
          ) {
            const earned = gamificationSummary.todayPoints - previous.points;

            showReward(
              {
                total: earned,
                lines: [
                  {
                    type: "food_logged",
                    points: earned,
                  },
                ],
                todayPoints: gamificationSummary.todayPoints,
                currentStreak: gamificationSummary.currentStreak,
              },
              {
                subtitle: gamificationSummary.qualifiedToday
                  ? "Day complete! Your streak grows."
                  : `${gamificationSummary.todayPoints}/${DAILY_POINT_CAP} points today`,
              },
            );
          }

          lastPointsRef.current = {
            date: today,
            points: gamificationSummary.todayPoints,
          };
        }
      } catch (error) {
        Sentry.logger.error("Dashboard loading failed", {
          operation: "load_dashboard",
        });
        Sentry.captureException(error);
        posthog.capture("dashboard_load_failed");

        showDialog(
          "Could not load dashboard",
          "Please try again.",
          [{ text: "OK" }],
          { type: "error" },
        );
      } finally {
        hasLoadedRef.current = true;
        isLoadingRef.current = false;
        setLoading(false);
      }
    },
    [posthog, showDialog, showReward],
  );

  useFocusEffect(
    useCallback(() => {
      posthog.capture("dashboard_viewed");
      void loadDashboard();
    }, [loadDashboard, posthog]),
  );

  const deleteFoodLog = (foodLogId: string) => {
    showDialog(
      "Delete food?",
      "Are you sure you want to remove this food entry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("food_logs")
                .delete()
                .eq("id", foodLogId);

              if (error) {
                Sentry.logger.error("Food log deletion failed", {
                  operation: "delete_food_log",
                });
                Sentry.captureException(error);
                posthog.capture("food_log_delete_failed");

                showDialog(
                  "Delete failed",
                  "Could not delete this food entry. Please try again.",
                  [{ text: "OK" }],
                  { type: "error" },
                );
                return;
              }

              Sentry.logger.info("Food log deleted", {
                operation: "delete_food_log",
              });
              posthog.capture("food_log_deleted");
              await loadDashboard(false);
            } catch (error) {
              Sentry.logger.error("Unexpected food log deletion error", {
                operation: "delete_food_log",
              });
              Sentry.captureException(error);
              posthog.capture("food_log_delete_failed");

              showDialog(
                "Delete failed",
                "Could not delete this food entry. Please try again.",
                [{ text: "OK" }],
                { type: "error" },
              );
            }
          },
        },
      ],
      { type: "confirmation" },
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  const caloriesConsumed = nutrition.calories;
  const rawProgress =
    dailyCalories && dailyCalories > 0
      ? caloriesConsumed / dailyCalories
      : 0;
  const progress = Math.min(rawProgress, 1);
  const overGoal =
    dailyCalories !== null &&
    dailyCalories > 0 &&
    caloriesConsumed > dailyCalories;
  const remaining =
    dailyCalories !== null
      ? Math.max(dailyCalories - caloriesConsumed, 0)
      : null;

  // Tab bar ~60 + safe area; keep FAB clear of it
  const fabBottomOffset = 20;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>YOUR DAILY FUEL</Text>
            <Text style={styles.title}>Let's make today count.</Text>
            <Text style={styles.subtitle}>Today's nutrition at a glance</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.profileButton,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push("/profile")}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <UserRound size={20} color={TEXT} />
          </Pressable>
        </View>

        {/* Daily calories card */}
        <View style={styles.calorieCard}>
          <View style={styles.calorieCardHeader}>
            <View style={styles.calorieTitleRow}>
              <View style={styles.flameBadge}>
                <Flame size={14} color={ACCENT} />
              </View>
              <Text style={styles.calorieTitle}>Daily calories</Text>
            </View>
            <View style={styles.todayPill}>
              <Text style={styles.todayPillText}>TODAY</Text>
            </View>
          </View>

          <View style={styles.calorieContent}>
            <CalorieRing progress={progress} overGoal={overGoal}>
              <Text style={styles.ringPercent}>
                {dailyCalories ? Math.round(progress * 100) : "—"}
                {dailyCalories ? "%" : ""}
              </Text>
              <Text style={styles.ringCaption}>
                {dailyCalories ? "of goal" : "set goal"}
              </Text>
            </CalorieRing>

            <View style={styles.calorieStats}>
              <Text style={styles.consumedCalories}>
                {Math.round(caloriesConsumed).toLocaleString("en-IN")}
              </Text>
              <Text style={styles.smallLabel}>kcal consumed</Text>

              <View style={styles.statDivider} />

              <Text style={styles.goalValue}>
                {dailyCalories !== null
                  ? `${Math.round(dailyCalories).toLocaleString("en-IN")} kcal`
                  : "Not set"}
              </Text>
              <Text style={styles.smallLabel}>daily goal</Text>
            </View>
          </View>

          <View style={styles.remainingPanel}>
            <View style={styles.remainingIcon}>
              <Flame size={16} color={overGoal ? "#FF9A76" : ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.remainingTitle}>
                {overGoal
                  ? `${Math.round(caloriesConsumed - (dailyCalories ?? 0)).toLocaleString("en-IN")} kcal over`
                  : remaining !== null
                    ? `${Math.round(remaining).toLocaleString("en-IN")} kcal left`
                    : "Set a daily goal"}
              </Text>
              <Text style={styles.remainingSub}>
                {overGoal
                  ? "You're above target — balance the rest of the day."
                  : "Keep tracking to stay on top of your goal."}
              </Text>
            </View>
          </View>
        </View>

        {/* Week / points strip */}
        {gamification && <HomeProgressCard summary={gamification} />}

        {/* Macros */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your macros</Text>
            <Text style={styles.sectionSubtitle}>Nutrients logged today</Text>
          </View>
          <Leaf size={18} color={ACCENT} />
        </View>

        <View style={styles.macroGrid}>
          <MacroCard
            label="Protein"
            value={nutrition.protein}
            icon={<Beef size={18} color={ACCENT} />}
          />
          <MacroCard
            label="Carbs"
            value={nutrition.carbs}
            icon={<Wheat size={18} color={ACCENT} />}
          />
          <MacroCard
            label="Fat"
            value={nutrition.fat}
            icon={<Droplets size={18} color={ACCENT} />}
          />
          <MacroCard
            label="Fiber"
            value={nutrition.fiber}
            icon={<Apple size={18} color={ACCENT} />}
          />
        </View>

        {/* Today's food */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Today's food</Text>
            <Text style={styles.sectionSubtitle}>
              {foodLogs.length === 1
                ? "1 item logged"
                : `${foodLogs.length} items logged`}
            </Text>
          </View>
          <View style={styles.foodCountBadge}>
            <Text style={styles.foodCountText}>{foodLogs.length}</Text>
          </View>
        </View>

        {foodLogs.length === 0 ? (
          <View style={styles.emptyFoodCard}>
            <View style={styles.emptyIcon}>
              <Leaf size={22} color={ACCENT} />
            </View>
            <Text style={styles.emptyFoodTitle}>No food logged yet</Text>
            <Text style={styles.emptyFoodText}>
              Tap the + button below to scan a meal or add food manually.
            </Text>
          </View>
        ) : (
          <View style={styles.foodList}>
            {foodLogs.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.foodRow,
                  index === foodLogs.length - 1 && styles.lastFoodRow,
                ]}
              >
                <View style={styles.foodIcon}>
                  <Leaf size={16} color={ACCENT} />
                </View>
                <View style={styles.foodInfo}>
                  <Text style={styles.foodName} numberOfLines={1}>
                    {item.food_name}
                  </Text>
                  <Text style={styles.foodQuantity}>
                    {item.quantity}
                    {item.unit}
                  </Text>
                </View>
                <View style={styles.foodActions}>
                  <Text style={styles.foodCalories}>
                    {Math.round(item.calories)}
                  </Text>
                  <Text style={styles.kcalLabel}>kcal</Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => deleteFoodLog(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.food_name}`}
                >
                  <Trash2 size={15} color="#FF8A8A" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footerText}>
          Small choices. Consistent progress.
        </Text>
      </ScrollView>

      {/* Floating add button — always visible, bottom center */}
      <FloatingAddButton bottomOffset={fabBottomOffset} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                         */
/* ------------------------------------------------------------------ */

type CalorieRingProps = {
  progress: number;
  overGoal: boolean;
  children: React.ReactNode;
};

function CalorieRing({ progress, overGoal, children }: CalorieRingProps) {
  const size = 118;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const animatedProgress = useRef(new Animated.Value(0)).current;
  const AnimatedCircle = Animated.createAnimatedComponent(Circle);

  useEffect(() => {
    const animation = Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 650,
      useNativeDriver: false,
    });

    animation.start();
    return () => animation.stop();
  }, [progress, animatedProgress]);

  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={BORDER}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={overGoal ? "#FF9A76" : ACCENT}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ alignItems: "center" }}>{children}</View>
    </View>
  );
}

type MacroCardProps = {
  label: string;
  value: number;
  icon: React.ReactNode;
};

function MacroCard({ label, value, icon }: MacroCardProps) {
  return (
    <View style={styles.macroCard}>
      <View style={styles.macroIcon}>{icon}</View>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>
        {value.toFixed(1)}
        <Text style={styles.macroUnit}> g</Text>
      </Text>
      <View style={styles.macroBarTrack}>
        <View
          style={[
            styles.macroBarFill,
            { width: `${Math.min((value / 80) * 100, 100)}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 22,
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: ACCENT,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: TEXT,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: MUTED,
  },
  profileButton: {
    width: 52,
    height: 52,
    borderRadius: 30,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10
  },
  calorieCard: {
    backgroundColor: CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 16,
  },
  calorieCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  calorieTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flameBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
  },
  calorieTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
  },
  todayPill: {
    backgroundColor: "#29351F",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  todayPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: ACCENT,
  },
  calorieContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  calorieStats: {
    flex: 1,
  },
  consumedCalories: {
    fontSize: 34,
    fontWeight: "900",
    color: TEXT,
    letterSpacing: -1,
  },
  goalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
  },
  smallLabel: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  statDivider: {
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 10,
  },
  ringPercent: {
    fontSize: 22,
    fontWeight: "900",
    color: TEXT,
  },
  ringCaption: {
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },
  remainingPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#29351F",
  },
  remainingIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(182,243,107,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  remainingTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
  },
  remainingSub: {
    marginTop: 3,
    fontSize: 12,
    color: MUTED,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
  },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: MUTED,
  },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  macroCard: {
    width: "47.5%",
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  macroIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  macroLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
  },
  macroValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "900",
    color: TEXT,
  },
  macroUnit: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
  },
  macroBarTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    overflow: "hidden",
  },
  macroBarFill: {
    height: "100%",
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  foodCountBadge: {
    minWidth: 31,
    height: 31,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
  },
  foodCountText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: "800",
  },
  emptyFoodCard: {
    alignItems: "center",
    padding: 28,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },
  emptyFoodTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
  },
  emptyFoodText: {
    marginTop: 7,
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  foodList: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 10,
  },
  lastFoodRow: {
    borderBottomWidth: 0,
  },
  foodIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
  },
  foodQuantity: {
    marginTop: 5,
    fontSize: 12,
    color: MUTED,
  },
  foodActions: {
    alignItems: "flex-end",
    minWidth: 48,
  },
  foodCalories: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
  },
  kcalLabel: {
    marginTop: 3,
    fontSize: 11,
    color: MUTED,
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#332222",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    marginTop: 28,
    textAlign: "center",
    fontSize: 12,
    color: "#686868",
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.75,
  },
});