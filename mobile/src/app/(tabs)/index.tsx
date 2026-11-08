import { useCallback, useEffect, useRef, useState } from "react";
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
import { useAppDialog } from "../../contexts/AppDialogContext";
import Svg, { Circle } from "react-native-svg";
import {
  Apple,
  Camera,
  ChevronRight,
  Flame,
  Leaf,
  Plus,
  ScanLine,
  Trash2,
  UserRound,
  Wheat,
  Beef,
  Droplets,
} from "lucide-react-native";

import { getCurrentUser, isProfileComplete } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../../lib/sentry";

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
  const hasLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const loadDashboard = useCallback(
    async (showLoader = !hasLoadedRef.current) => {
      // Prevent duplicate requests.
      if (isLoadingRef.current) return;

      isLoadingRef.current = true;

      // Only show the full-screen loader on the first load.
      if (showLoader && !hasLoadedRef.current) {
        setLoading(true);
      }

      try {
        const user = await getCurrentUser();

        if (!user) {
          setDailyCalories(null);
          setFoodLogs([]);
          setNutrition({
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
          });
          return;
        }

        const complete = await isProfileComplete(user.id);

        if (!complete) {
          router.replace("/onboarding");
          return;
        }

        // Get today's date in local time.
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const today = `${year}-${month}-${day}`;

        // Fetch the goal and food logs simultaneously.
        const [goalResult, foodLogsResult] = await Promise.all([
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
        ]);

        // Update calorie goal.
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

        // Update food logs and nutrition.
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
            {
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              fiber: 0,
            },
          );

          setNutrition(totals);
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
    [posthog, showDialog],
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
        {
          text: "Cancel",
          style: "cancel",
        },
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.loadingText}>Preparing your dashboard…</Text>
      </View>
    );
  }

  const caloriesConsumed = Math.round(nutrition.calories);
  const caloriesRemaining =
    dailyCalories !== null
      ? Math.max(dailyCalories - caloriesConsumed, 0)
      : null;

  const progress =
    dailyCalories && dailyCalories > 0
      ? Math.min(caloriesConsumed / dailyCalories, 1)
      : 0;

  const overGoal = dailyCalories !== null && caloriesConsumed > dailyCalories;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
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
            <UserRound size={22} color={ACCENT} strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* Calories */}
        <View style={styles.calorieCard}>
          <View style={styles.cardHeading}>
            <View style={styles.headingIcon}>
              <Flame size={18} color={ACCENT} />
            </View>
            <Text style={styles.cardHeadingText}>Daily calories</Text>
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>TODAY</Text>
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
                {caloriesConsumed.toLocaleString("en-IN")}
              </Text>
              <Text style={styles.smallLabel}>kcal consumed</Text>

              <View style={styles.statDivider} />

              <Text style={styles.goalValue}>
                {dailyCalories !== null
                  ? `${dailyCalories.toLocaleString("en-IN")} kcal`
                  : "Not set"}
              </Text>
              <Text style={styles.smallLabel}>daily goal</Text>
            </View>
          </View>

          <View style={styles.remainingPanel}>
            <View style={styles.remainingIcon}>
              <Flame size={16} color={overGoal ? "#FF9A76" : ACCENT} />
            </View>
            <View style={styles.remainingTextContainer}>
              <Text style={styles.remainingTitle}>
                {dailyCalories === null
                  ? "Set a daily calorie goal"
                  : overGoal
                    ? "Daily goal reached"
                    : `${caloriesRemaining?.toLocaleString("en-IN")} kcal left`}
              </Text>
              <Text style={styles.remainingSubtitle}>
                {dailyCalories === null
                  ? "Set your target to track your progress."
                  : overGoal
                    ? "You've gone over your daily target."
                    : "Keep tracking to stay on top of your goal."}
              </Text>
            </View>
          </View>
        </View>

        {/* Macros */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Your macros</Text>
            <Text style={styles.sectionSubtitle}>Nutrients logged today</Text>
          </View>
          <Leaf size={20} color={ACCENT} />
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

        {/* Actions */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Log your food</Text>
            <Text style={styles.sectionSubtitle}>
              Choose how you'd like to add a meal
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryAction,
            pressed && styles.pressed,
          ]}
          onPress={() => router.push("/add-food")}
          accessibilityRole="button"
        >
          <View style={styles.primaryActionIcon}>
            <Plus size={23} color={BG} strokeWidth={2.5} />
          </View>
          <View style={styles.actionText}>
            <Text style={styles.primaryActionTitle}>Add food</Text>
            <Text style={styles.primaryActionSubtitle}>
              Search foods and enter portions
            </Text>
          </View>
          <ChevronRight size={21} color={BG} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryAction,
            pressed && styles.pressed,
          ]}
          onPress={() => router.push("/scan-meal")}
          accessibilityRole="button"
        >
          <View style={styles.secondaryActionIcon}>
            <ScanLine size={22} color={ACCENT} />
          </View>
          <View style={styles.actionText}>
            <Text style={styles.secondaryActionTitle}>Scan meal with AI</Text>
            <Text style={styles.secondaryActionSubtitle}>
              Estimate nutrition from a photo
            </Text>
          </View>
          <Camera size={19} color={MUTED} />
        </Pressable>

        {/* Food log */}
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
              <Apple size={24} color={ACCENT} />
            </View>
            <Text style={styles.emptyFoodTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyFoodText}>
              Your meals will show up here when you add them.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.emptyAction,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push("/add-food")}
            >
              <Text style={styles.emptyActionText}>Log your first meal</Text>
              <ChevronRight size={16} color={ACCENT} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.foodList}>
            {foodLogs.map((food, index) => (
              <View
                key={food.id}
                style={[
                  styles.foodRow,
                  index === foodLogs.length - 1 && styles.lastFoodRow,
                ]}
              >
                <View style={styles.foodIcon}>
                  <Apple size={19} color={ACCENT} />
                </View>

                <View style={styles.foodInfo}>
                  <Text style={styles.foodName} numberOfLines={2}>
                    {food.food_name}
                  </Text>
                  <Text style={styles.foodQuantity}>
                    {food.quantity} {food.unit}
                  </Text>
                </View>

                <View style={styles.foodActions}>
                  <Text style={styles.foodCalories}>
                    {Math.round(food.calories).toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.kcalLabel}>kcal</Text>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => deleteFoodLog(food.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${food.food_name}`}
                  hitSlop={8}
                >
                  <Trash2 size={17} color="#FF8585" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footerText}>
          Small choices. Consistent progress.
        </Text>
      </ScrollView>
    </View>
  );
}

type CalorieRingProps = {
  progress: number;
  overGoal: boolean;
  children: React.ReactNode;
};

function CalorieRing({ progress, overGoal, children }: CalorieRingProps) {
  const size = 142;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
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
    <View style={styles.ringContainer}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#343434"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={overGoal ? "#FF9A76" : ACCENT}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
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
      <View style={styles.macroCardTop}>
        <View style={styles.macroIcon}>{icon}</View>
        <Text style={styles.macroLabel}>{label}</Text>
      </View>
      <Text style={styles.macroValue}>
        {Number(value).toFixed(1)}
        <Text style={styles.macroUnit}> g</Text>
      </Text>
      <View style={styles.macroAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
  loadingText: {
    color: MUTED,
    fontSize: 13,
    marginTop: 14,
  },
  container: {
    paddingTop: 62,
    paddingHorizontal: 20,
    paddingBottom: 44,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 26,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    color: ACCENT,
  },
  title: {
    marginTop: 8,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "800",
    color: TEXT,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: MUTED,
  },
  profileButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.78,
  },
  calorieCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  headingIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeadingText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
  },
  todayBadge: {
    backgroundColor: "#29351F",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  todayBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: ACCENT,
  },
  calorieContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 22,
    marginBottom: 20,
  },
  ringContainer: {
    width: 142,
    height: 142,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercent: {
    fontSize: 27,
    fontWeight: "800",
    color: TEXT,
  },
  ringCaption: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  calorieStats: {
    flex: 1,
    alignItems: "flex-start",
    paddingLeft: 4,
  },
  consumedCalories: {
    fontSize: 32,
    fontWeight: "800",
    color: TEXT,
    letterSpacing: -1,
  },
  smallLabel: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
  },
  statDivider: {
    width: "100%",
    height: 1,
    backgroundColor: BORDER,
    marginVertical: 13,
  },
  goalValue: {
    color: "#DADADA",
    fontSize: 17,
    fontWeight: "700",
  },
  remainingPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#22291D",
  },
  remainingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#303D26",
    alignItems: "center",
    justifyContent: "center",
  },
  remainingTextContainer: {
    flex: 1,
  },
  remainingTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: TEXT,
  },
  remainingSubtitle: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: "#B7B7B7",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 30,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: TEXT,
  },
  sectionSubtitle: {
    marginTop: 5,
    fontSize: 12,
    color: MUTED,
  },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  macroCard: {
    width: "47%",
    flexGrow: 1,
    minHeight: 126,
    padding: 15,
    borderRadius: 17,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  macroCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  macroIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
  },
  macroLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C5C5C5",
  },
  macroValue: {
    marginTop: 15,
    fontSize: 25,
    fontWeight: "800",
    color: TEXT,
  },
  macroUnit: {
    fontSize: 13,
    fontWeight: "500",
    color: MUTED,
  },
  macroAccent: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
    marginTop: 11,
  },
  primaryAction: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 17,
    backgroundColor: ACCENT,
    gap: 12,
  },
  primaryActionIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#D0FFA0",
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
  },
  primaryActionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: BG,
  },
  primaryActionSubtitle: {
    fontSize: 12,
    color: "#344326",
    marginTop: 4,
  },
  secondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 17,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
    marginTop: 10,
  },
  secondaryActionIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: TEXT,
  },
  secondaryActionSubtitle: {
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
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
    padding: 24,
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
  },
  emptyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 17,
    padding: 9,
  },
  emptyActionText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: "700",
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
    marginTop: 30,
    textAlign: "center",
    fontSize: 12,
    color: "#686868",
    letterSpacing: 0.3,
  },
});
