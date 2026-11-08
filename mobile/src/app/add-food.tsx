import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  ArrowLeft,
  Search,
  Utensils,
  Scale,
  Flame,
  Beef,
  Wheat,
  Droplets,
  Leaf,
  CheckCircle2,
  ChevronRight,
  Plus,
  X,
} from "lucide-react-native";

import { supabase } from "@/lib/supabase";
import { calculateFood, logFood, saveFood } from "@/lib/food";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "@/lib/sentry";
import { useAppDialog } from "@/contexts/AppDialogContext";

type FoodSearchResult = {
  fdcId: number;
  name: string;
  brand: string | null;
  dataType: string | null;
  servingSize: number | null;
  servingUnit: string | null;
  nutrition: {
    basis: string;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
  };
};

type SelectedFood = {
  id: string;
  name: string;
  source: string | null;
};

type CalculationResult = {
  food: SelectedFood;
  quantity_g: number;
  nutrition: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
  };
};

const C = {
  bg: "#101010",
  card: "#1A1A1A",
  cardAlt: "#202020",
  accent: "#B6F36B",
  text: "#F5F5F5",
  muted: "#969696",
  border: "#303030",
  danger: "#FF7777",
};

export default function AddFoodScreen() {
  const posthog = usePostHog();
  const { showDialog } = useAppDialog();

  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [foods, setFoods] = useState<FoodSearchResult[]>([]);
  const [selectedFood, setSelectedFood] = useState<SelectedFood | null>(null);
  const [calculation, setCalculation] = useState<CalculationResult | null>(
    null,
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function searchFoods() {
    const query = search.trim();

    if (!query) {
      showDialog(
        "Enter a food",
        "Try chicken, rice, oats, or another food.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (loading || saving) return;

    Keyboard.dismiss();
    setLoading(true);
    setHasSearched(false);
    setFoods([]);
    setSelectedFood(null);
    setCalculation(null);
    setQuantity("");

    try {
      const { data, error } = await supabase.functions.invoke("search-food", {
        body: { query },
      });

      if (error) {
        throw new Error(error.message);
      }

      setFoods(data?.foods ?? []);
      setHasSearched(true);
    } catch (error) {
      Sentry.logger.error("Food search failed", {
        operation: "food_search",
      });
      Sentry.captureException(error);

      posthog.capture("food_search_failed", {
        failure_stage: "search_food",
      });

      showDialog(
        "Search failed",
        "Could not search for food right now. Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  }

  async function selectFood(food: FoodSearchResult) {
    if (loading || saving) return;

    Keyboard.dismiss();
    setLoading(true);
    setCalculation(null);

    try {
      const savedFood = await saveFood(food.fdcId);

      setSelectedFood({
        id: savedFood.id,
        name: savedFood.name,
        source: savedFood.source ?? null,
      });

      setQuantity("");
      setFoods([]);
      setHasSearched(false);
    } catch (error) {
      Sentry.logger.error("Food reference selection failed", {
        operation: "food_selection",
      });
      Sentry.captureException(error);

      posthog.capture("food_selection_failed", {
        failure_stage: "save_food_reference",
      });

      showDialog(
        "Could not select food",
        "This food could not be added to the food database. Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  }

  async function calculateSelectedFood() {
    if (!selectedFood) {
      showDialog(
        "Select a food",
        "Choose a food first.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    const quantityG = Number(quantity);

    if (!Number.isFinite(quantityG) || quantityG <= 0) {
      showDialog(
        "Invalid quantity",
        "Enter a quantity greater than 0 grams.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (quantityG > 100000) {
      showDialog(
        "Quantity too large",
        "Please enter a quantity of 100,000 grams or less.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (loading || saving) return;

    Keyboard.dismiss();
    setLoading(true);
    setCalculation(null);

    try {
      const result = await calculateFood(selectedFood.id, quantityG);
      setCalculation(result);
    } catch (error) {
      Sentry.logger.error("Food nutrition calculation failed", {
        operation: "food_calculation",
      });
      Sentry.captureException(error);

      posthog.capture("food_calculation_failed", {
        failure_stage: "calculate_food",
      });

      showDialog(
        "Calculation failed",
        "Could not calculate nutrition. Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndAdd() {
    if (!selectedFood || !calculation || saving || loading) {
      return;
    }

    Keyboard.dismiss();
    setSaving(true);

    try {
      const now = new Date();
      const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      await logFood(selectedFood.id, calculation.quantity_g, today);

      Sentry.logger.info("Food log created", {
        operation: "food_log_created",
        source: "manual",
      });

      posthog.capture("food_log_created", {
        source: "manual",
      });

      showDialog(
        "Food added!",
        `${selectedFood.name} has been added to today's log.`,
        [
          {
            text: "Done",
            onPress: () => router.back(),
          },
        ],
        { type: "success", cancelable: false },
      );
    } catch (error) {
      Sentry.logger.error("Food log could not be completed", {
        operation: "food_log_created",
        source: "manual",
      });
      Sentry.captureException(error);

      posthog.capture("food_log_failed", {
        source: "manual",
      });

      showDialog(
        "Could not save",
        "Your food could not be added. Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setSaving(false);
    }
  }

  function resetSelection() {
    setSelectedFood(null);
    setCalculation(null);
    setQuantity("");
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={21} color={C.text} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerEyebrow}>FOOD JOURNAL</Text>
            <Text style={styles.headerTitle}>Add food</Text>
          </View>

          <View style={styles.headerIcon}>
            <Utensils size={20} color={C.accent} />
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>
            Fuel your <Text style={styles.accentText}>goals.</Text>
          </Text>
          <Text style={styles.subtitle}>
            Find your food, set the portion, and track its nutrition.
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>01</Text>
          </View>
          <View style={styles.sectionHeadingText}>
            <Text style={styles.sectionTitle}>Find your food</Text>
            <Text style={styles.sectionSubtitle}>Search a food database</Text>
          </View>
        </View>

        <View style={styles.searchCard}>
          <View style={styles.searchInputWrap}>
            <Search size={19} color={C.muted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="e.g. chicken breast"
              placeholderTextColor="#777777"
              style={styles.searchInput}
              onSubmitEditing={searchFoods}
              returnKeyType="search"
              editable={!loading && !saving}
              accessibilityLabel="Search for a food"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch("")}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={8}
              >
                <X size={17} color={C.muted} />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.primaryButton, loading && styles.disabledButton]}
            onPress={searchFoods}
            disabled={loading || saving}
          >
            {loading ? (
              <ActivityIndicator color={C.bg} />
            ) : (
              <>
                <Search size={18} color={C.bg} />
                <Text style={styles.primaryButtonText}>Search foods</Text>
              </>
            )}
          </Pressable>
        </View>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={C.accent} size="small" />
            <Text style={styles.mutedText}>Finding your food...</Text>
          </View>
        )}

        {foods.length > 0 && (
          <View style={styles.resultsSection}>
            <View style={styles.resultsHeader}>
              <Text style={styles.sectionTitle}>Search results</Text>
              <Text style={styles.resultCount}>{foods.length} found</Text>
            </View>

            {foods.map((food) => (
              <Pressable
                key={food.fdcId}
                style={styles.foodResult}
                onPress={() => selectFood(food)}
                disabled={loading || saving}
              >
                <View style={styles.foodResultIcon}>
                  <Utensils size={19} color={C.accent} />
                </View>

                <View style={styles.foodResultInfo}>
                  <Text style={styles.foodName}>{food.name}</Text>
                  {!!food.brand && (
                    <Text style={styles.source}>{food.brand}</Text>
                  )}
                  {!!food.dataType && (
                    <Text style={styles.source}>{food.dataType}</Text>
                  )}
                </View>

                <ChevronRight size={19} color={C.muted} />
              </Pressable>
            ))}
          </View>
        )}

        {hasSearched && foods.length === 0 && !loading && (
          <View style={styles.emptyCard}>
            <Search size={25} color={C.muted} />
            <Text style={styles.emptyTitle}>No foods found</Text>
            <Text style={styles.mutedText}>
              Try a different name, such as cooked rice or raw oats.
            </Text>
          </View>
        )}

        {selectedFood && (
          <>
            <View style={styles.sectionHeading}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>02</Text>
              </View>
              <View style={styles.sectionHeadingText}>
                <Text style={styles.sectionTitle}>Set your portion</Text>
                <Text style={styles.sectionSubtitle}>
                  Nutrition is calculated by weight
                </Text>
              </View>
            </View>

            <View style={styles.selectedCard}>
              <View style={styles.selectedTop}>
                <View style={styles.selectedIcon}>
                  <CheckCircle2 size={21} color={C.accent} />
                </View>
                <View style={styles.selectedInfo}>
                  <Text style={styles.selectedLabel}>SELECTED FOOD</Text>
                  <Text style={styles.selectedName}>{selectedFood.name}</Text>
                  {!!selectedFood.source && (
                    <Text style={styles.source}>{selectedFood.source}</Text>
                  )}
                </View>
                <Pressable
                  onPress={resetSelection}
                  style={styles.smallIconButton}
                  accessibilityRole="button"
                  accessibilityLabel="Change selected food"
                >
                  <X size={17} color={C.muted} />
                </Pressable>
              </View>

              <View style={styles.divider} />

              <Text style={styles.inputLabel}>PORTION SIZE</Text>
              <View style={styles.quantityRow}>
                <Scale size={20} color={C.muted} />
                <TextInput
                  value={quantity}
                  onChangeText={(value) => {
                    setQuantity(value);
                    setCalculation(null);
                  }}
                  placeholder="Enter quantity"
                  placeholderTextColor="#777777"
                  keyboardType="decimal-pad"
                  style={styles.quantityInput}
                  accessibilityLabel="Quantity in grams"
                  editable={!loading && !saving}
                  returnKeyType="done"
                  onSubmitEditing={calculateSelectedFood}
                />
                <View style={styles.gramBadge}>
                  <Text style={styles.gramText}>GRAMS</Text>
                </View>
              </View>

              <Pressable
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={calculateSelectedFood}
                disabled={loading || saving}
              >
                {loading ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <>
                    <Flame size={18} color={C.bg} />
                    <Text style={styles.primaryButtonText}>
                      Calculate nutrition
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}

        {calculation && (
          <>
            <View style={styles.sectionHeading}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>03</Text>
              </View>
              <View style={styles.sectionHeadingText}>
                <Text style={styles.sectionTitle}>Nutrition preview</Text>
                <Text style={styles.sectionSubtitle}>
                  Review before adding to your log
                </Text>
              </View>
            </View>

            <View style={styles.nutritionCard}>
              <View style={styles.caloriePanel}>
                <View style={styles.calorieIcon}>
                  <Flame size={21} color={C.accent} />
                </View>
                <Text style={styles.calorieLabel}>TOTAL CALORIES</Text>
                <View style={styles.calorieValueRow}>
                  <Text style={styles.calorieValue}>
                    {calculation.nutrition.calories === null
                      ? "—"
                      : Math.round(calculation.nutrition.calories)}
                  </Text>
                  <Text style={styles.calorieUnit}>kcal</Text>
                </View>
                <Text style={styles.calorieFootnote}>
                  {calculation.quantity_g} g serving
                </Text>
              </View>

              <View style={styles.macroGrid}>
                <Macro
                  label="Protein"
                  value={calculation.nutrition.protein}
                  suffix="g"
                  icon={<Beef size={17} color={C.accent} />}
                />
                <Macro
                  label="Carbs"
                  value={calculation.nutrition.carbs}
                  suffix="g"
                  icon={<Wheat size={17} color="#E8C477" />}
                />
                <Macro
                  label="Fat"
                  value={calculation.nutrition.fat}
                  suffix="g"
                  icon={<Droplets size={17} color="#8BCBFF" />}
                />
                <Macro
                  label="Fiber"
                  value={calculation.nutrition.fiber}
                  suffix="g"
                  icon={<Leaf size={17} color="#9EE0B0" />}
                />
              </View>

              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  Nutrition values are estimates. Actual values can vary with
                  ingredients and preparation.
                </Text>
              </View>

              <Pressable
                style={[styles.primaryButton, saving && styles.disabledButton]}
                onPress={confirmAndAdd}
                disabled={saving || loading}
              >
                {saving ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <>
                    <Plus size={19} color={C.bg} />
                    <Text style={styles.primaryButtonText}>
                      Confirm & add food
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={calculateSelectedFood}
                disabled={saving || loading}
              >
                <Text style={styles.secondaryButtonText}>
                  Recalculate portion
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <Pressable
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={saving}
        >
          <ArrowLeft size={16} color={C.muted} />
          <Text style={styles.cancelText}>Back to dashboard</Text>
        </Pressable>

        <View style={styles.footer}>
          <View style={styles.footerDot} />
          <Text style={styles.footerText}>SMALL STEPS. CONSISTENT PROGRESS.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Macro({
  label,
  value,
  suffix,
  icon,
}: {
  label: string;
  value: number | null;
  suffix: string;
  icon: ReactNode;
}) {
  return (
    <View style={styles.macroCard}>
      <View style={styles.macroHeader}>
        {icon}
        <Text style={styles.macroLabel}>{label}</Text>
      </View>
      <Text style={styles.macroValue}>
        {value === null ? "—" : `${Number(value.toFixed(1))} ${suffix}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 32,
    gap: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
    gap: 3,
  },
  headerEyebrow: {
    fontSize: 10,
    color: C.accent,
    fontWeight: "800",
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: C.text,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: "#242D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  intro: {
    gap: 8,
    marginTop: 2,
  },
  title: {
    color: C.text,
    fontSize: 31,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  accentText: {
    color: C.accent,
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#242D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 13,
    color: C.accent,
    fontWeight: "800",
  },
  sectionHeadingText: {
    flex: 1,
    gap: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: C.text,
  },
  sectionSubtitle: {
    color: C.muted,
    fontSize: 12,
  },
  searchCard: {
    padding: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    gap: 12,
  },
  searchInputWrap: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  primaryButton: {
    minHeight: 51,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: C.accent,
  },
  primaryButtonText: {
    color: C.bg,
    fontSize: 14,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 8,
  },
  mutedText: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  resultsSection: {
    gap: 10,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  resultCount: {
    color: C.muted,
    fontSize: 12,
  },
  foodResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  foodResultIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "#242D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  foodResultInfo: {
    flex: 1,
    gap: 4,
  },
  foodName: {
    color: C.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  source: {
    color: C.muted,
    fontSize: 11,
  },
  emptyCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  selectedCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    gap: 15,
  },
  selectedTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  selectedIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#242D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedInfo: {
    flex: 1,
    gap: 4,
  },
  selectedLabel: {
    color: C.accent,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  selectedName: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  smallIconButton: {
    padding: 9,
    borderRadius: 11,
    backgroundColor: C.cardAlt,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
  },
  inputLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  quantityInput: {
    flex: 1,
    paddingVertical: 13,
    color: C.text,
    fontSize: 16,
  },
  gramBadge: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: C.cardAlt,
  },
  gramText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  nutritionCard: {
    padding: 15,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    gap: 15,
  },
  caloriePanel: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: "#222D1B",
    gap: 8,
  },
  calorieIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#303E25",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  calorieLabel: {
    color: "#C4D5B0",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  calorieValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  calorieValue: {
    color: C.accent,
    fontSize: 39,
    fontWeight: "800",
    letterSpacing: -1,
  },
  calorieUnit: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  calorieFootnote: {
    color: "#C4D5B0",
    fontSize: 12,
  },
  macroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  macroCard: {
    width: "48%",
    flexGrow: 1,
    minHeight: 91,
    padding: 13,
    borderRadius: 14,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  macroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  macroLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  macroValue: {
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
  },
  notice: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.cardAlt,
  },
  noticeText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  cancelText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 4,
  },
  footerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  footerText: {
    color: "#777777",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
});
