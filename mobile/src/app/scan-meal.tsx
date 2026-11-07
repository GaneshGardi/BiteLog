import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flame,
  ImagePlus,
  Leaf,
  Plus,
  ScanLine,
  Trash2,
  Utensils,
  Wheat,
  X,
  Beef,
  Droplets,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../lib/sentry";

type MealItem = {
  name: string;
  quantity_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type MealResult = {
  meal_name: string;
  notes?: string;
  items: MealItem[];
};

type NewFoodForm = {
  name: string;
  quantity_g: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
};

const emptyFood: NewFoodForm = {
  name: "",
  quantity_g: "100",
  calories: "",
  protein: "0",
  carbs: "0",
  fat: "0",
  fiber: "0",
};

const localDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const numberValue = (value: string) => Number(value.trim());

export default function ScanMealScreen() {
  const posthog = usePostHog();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [meal, setMeal] = useState<MealResult | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFood, setNewFood] = useState<NewFoodForm>({ ...emptyFood });

  const totals = useMemo(() => {
    const items = meal?.items ?? [];

    return items.reduce(
      (sum, item) => ({
        calories: sum.calories + (Number(item.calories) || 0),
        protein: sum.protein + (Number(item.protein) || 0),
        carbs: sum.carbs + (Number(item.carbs) || 0),
        fat: sum.fat + (Number(item.fat) || 0),
        fiber: sum.fiber + (Number(item.fiber) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );
  }, [meal]);

  const pickImage = async (useCamera: boolean) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          useCamera
            ? "Allow camera access to take a photo of your meal."
            : "Allow photo library access to select a meal image.",
        );
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            quality: 0.8,
            base64: true,
          });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        Alert.alert(
          "Could not read image",
          "Please select another photo and try again.",
        );
        return;
      }

      setImageUri(asset.uri);
      setImageBase64(asset.base64);
      setMimeType(asset.mimeType || "image/jpeg");
      setMeal(null);
      setShowAddForm(false);
      setNewFood({ ...emptyFood });
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Unable to open images", "Please try again.");
    }
  };

  const analyzeMeal = async () => {
    if (!imageBase64) {
      Alert.alert(
        "Select a photo",
        "Take a photo or choose one from your gallery first.",
      );
      return;
    }

    setAnalyzing(true);
    posthog.capture("meal_scan_started");
    try {
      const { data, error } = await supabase.functions.invoke("analyze-meal", {
        body: {
          image_base64: imageBase64,
          mime_type: mimeType,
        },
      });

      if (error) throw error;

      if (!data?.success || !data?.meal || !Array.isArray(data.meal.items)) {
        throw new Error(
          data?.error || "The AI response was not in the expected format.",
        );
      }

      const normalizedMeal: MealResult = {
        meal_name: String(data.meal.meal_name || "Scanned meal"),
        notes: data.meal.notes ? String(data.meal.notes) : "",
        items: data.meal.items.map((item: Partial<MealItem>) => ({
          name: String(item.name || ""),
          quantity_g: Number(item.quantity_g) || 0,
          calories: Number(item.calories) || 0,
          protein: Number(item.protein) || 0,
          carbs: Number(item.carbs) || 0,
          fat: Number(item.fat) || 0,
          fiber: Number(item.fiber) || 0,
        })),
      };

      setMeal(normalizedMeal);
      Sentry.logger.info("Meal analysis completed", {
        operation: "meal_analysis",
      });

      posthog.capture("meal_scan_completed");
      setShowAddForm(false);

      if (normalizedMeal.items.length === 0) {
        Alert.alert(
          "No food detected",
          "Try a clearer photo with the food visible from above.",
        );
      }
    } catch (error) {
      console.error("Meal analysis error:", error);

      Sentry.logger.error("Meal analysis failed", {
        operation: "meal_analysis",
      });

      Sentry.captureException(error);

      posthog.capture("meal_scan_failed");

      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while analyzing your meal.";

      Alert.alert("Could not analyze meal", message);
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (index: number, field: keyof MealItem, value: string) => {
    setMeal((current) => {
      if (!current) return current;

      const items = [...current.items];
      const existing = { ...items[index] };

      if (field === "name") {
        existing.name = value;
      } else {
        const parsed = value.trim() === "" ? 0 : Number(value);

        if (!Number.isFinite(parsed) || parsed < 0) return current;

        const numericField = field as Exclude<keyof MealItem, "name">;
        existing[numericField] = parsed;
      }

      items[index] = existing;

      return { ...current, items };
    });
  };

  const removeItem = (index: number) => {
    setMeal((current) =>
      current
        ? {
            ...current,
            items: current.items.filter((_, i) => i !== index),
          }
        : current,
    );
  };

  const updateNewFood = (field: keyof NewFoodForm, value: string) => {
    setNewFood((current) => ({ ...current, [field]: value }));
  };

  const renderNutritionInput = (
    label: string,
    field: Exclude<keyof NewFoodForm, "name" | "quantity_g">,
    placeholder: string,
  ) => (
    <View style={styles.nutritionInput} key={field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={newFood[field]}
        onChangeText={(value) => updateNewFood(field, value)}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={C.muted}
      />
    </View>
  );

  const addFoodItem = () => {
    const name = newFood.name.trim();
    const quantity = numberValue(newFood.quantity_g);
    const calories = numberValue(newFood.calories);
    const protein = numberValue(newFood.protein);
    const carbs = numberValue(newFood.carbs);
    const fat = numberValue(newFood.fat);
    const fiber = numberValue(newFood.fiber);

    if (!name) {
      Alert.alert("Food name required", "Enter a name for this food item.");
      return;
    }

    const values = [quantity, calories, protein, carbs, fat, fiber];

    if (
      values.some((value) => !Number.isFinite(value) || value < 0) ||
      quantity <= 0
    ) {
      Alert.alert(
        "Check nutrition values",
        "Enter a portion greater than zero and valid non-negative nutrition values.",
      );
      return;
    }

    setMeal((current) => {
      if (!current) return current;

      return {
        ...current,
        items: [
          ...current.items,
          {
            name,
            quantity_g: quantity,
            calories,
            protein,
            carbs,
            fat,
            fiber,
          },
        ],
      };
    });

    setNewFood({ ...emptyFood });
    setShowAddForm(false);
  };

  const saveMeal = async () => {
    if (!meal || meal.items.length === 0) {
      Alert.alert(
        "Nothing to save",
        "Add at least one food item to your meal.",
      );
      return;
    }

    const invalidItem = meal.items.find(
      (item) =>
        !item.name.trim() ||
        !Number.isFinite(Number(item.quantity_g)) ||
        Number(item.quantity_g) <= 0 ||
        [item.calories, item.protein, item.carbs, item.fat, item.fiber].some(
          (value) => !Number.isFinite(Number(value)) || Number(value) < 0,
        ),
    );

    if (invalidItem) {
      Alert.alert(
        "Check your food items",
        "Every item needs a name, a portion greater than zero, and valid nutrition values.",
      );
      return;
    }

    setSaving(true);
    posthog.capture("ai_meal_save_started");

    try {
      const { data, error } = await supabase.functions.invoke("save-ai-meal", {
        body: {
          log_date: localDate(),
          items: meal.items.map((item) => ({
            name: item.name.trim(),
            quantity_g: Number(item.quantity_g),
            calories: Number(item.calories),
            protein: Number(item.protein),
            carbs: Number(item.carbs),
            fat: Number(item.fat),
            fiber: Number(item.fiber),
          })),
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "The meal could not be saved.");
      }
      Sentry.logger.info("AI meal saved successfully", {
        operation: "save_ai_meal",
      });

      posthog.capture("food_log_created", {
        source: "ai_scan",
      });
      posthog.capture("ai_meal_save_completed");
      
      Alert.alert(
        "Meal saved",
        "Your scanned meal has been added to today’s food log.",
        [
          {
            text: "Done",
            onPress: () => router.back(),
          },
        ],
      );
    } catch (error) {
      console.error("Save meal error:", error);

      Sentry.logger.error("AI meal save failed", {
        operation: "save_ai_meal",
      });

      Sentry.captureException(error);

      posthog.capture("ai_meal_save_failed");

      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while saving your meal.";

      Alert.alert("Could not save meal", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
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

          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>SMART FOOD TRACKING</Text>
            <Text style={styles.headerTitle}>Scan meal</Text>
          </View>

          <View style={styles.headerIcon}>
            <ScanLine size={22} color={C.accent} />
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>
            What's on your <Text style={styles.accent}>plate?</Text>
          </Text>

          <Text style={styles.subtitle}>
            Snap a photo and let AI estimate the nutrition. Review everything
            before saving.
          </Text>
        </View>

        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>01</Text>
          </View>

          <View style={styles.stepText}>
            <Text style={styles.sectionTitle}>Capture your meal</Text>
            <Text style={styles.hint}>Use a clear photo from above</Text>
          </View>
        </View>

        <View style={styles.photoCard}>
          {imageUri ? (
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: imageUri }}
                style={styles.mealImage}
                resizeMode="cover"
              />

              <View style={styles.photoBadge}>
                <CheckCircle2 size={14} color={C.accent} />
                <Text style={styles.photoBadgeText}>Photo selected</Text>
              </View>

              <Pressable
                style={styles.removePhoto}
                onPress={() => {
                  setImageUri(null);
                  setImageBase64(null);
                  setMeal(null);
                  setShowAddForm(false);
                }}
                disabled={analyzing || saving}
                accessibilityRole="button"
                accessibilityLabel="Remove selected photo"
              >
                <X size={18} color={C.text} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <View style={styles.cameraCircle}>
                <Camera size={30} color={C.accent} />
              </View>

              <Text style={styles.placeholderTitle}>Your meal starts here</Text>

              <Text style={styles.placeholderText}>
                Take a picture or upload one from your gallery.
              </Text>
            </View>
          )}

          <View style={styles.photoActions}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => pickImage(true)}
              disabled={analyzing || saving}
            >
              <Camera size={18} color={C.text} />
              <Text style={styles.secondaryButtonText}>Camera</Text>
            </Pressable>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => pickImage(false)}
              disabled={analyzing || saving}
            >
              <ImagePlus size={18} color={C.text} />
              <Text style={styles.secondaryButtonText}>Gallery</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[
            styles.primaryButton,
            (!imageBase64 || analyzing || saving) && styles.disabledButton,
          ]}
          onPress={analyzeMeal}
          disabled={!imageBase64 || analyzing || saving}
        >
          {analyzing ? (
            <>
              <ActivityIndicator color={C.bg} />
              <Text style={styles.primaryButtonText}>Analyzing meal...</Text>
            </>
          ) : (
            <>
              <ScanLine size={19} color={C.bg} />
              <Text style={styles.primaryButtonText}>Analyze with AI</Text>
            </>
          )}
        </Pressable>

        {analyzing && (
          <View style={styles.statusCard}>
            <ActivityIndicator color={C.accent} />

            <View style={styles.statusContent}>
              <Text style={styles.statusTitle}>Looking at your meal</Text>
              <Text style={styles.hint}>
                Identifying foods and estimating portions. This may take a few
                seconds.
              </Text>
            </View>
          </View>
        )}

        {meal && (
          <View style={styles.results}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>02</Text>
              </View>

              <View style={styles.stepText}>
                <Text style={styles.sectionTitle}>Review your meal</Text>
                <Text style={styles.hint}>
                  Edit any estimates that look incorrect
                </Text>
              </View>
            </View>

            <View style={styles.mealSummary}>
              <View style={styles.summaryTop}>
                <View style={styles.summaryIcon}>
                  <Utensils size={21} color={C.accent} />
                </View>

                <View style={styles.summaryInfo}>
                  <Text style={styles.eyebrow}>DETECTED MEAL</Text>
                  <Text style={styles.mealName}>
                    {meal.meal_name || "Detected food"}
                  </Text>
                </View>
              </View>

              {!!meal.notes && <Text style={styles.note}>{meal.notes}</Text>}

              <Text style={styles.helperText}>
                AI estimates can be inaccurate, especially for hidden
                ingredients, cooking oil, and portion sizes.
              </Text>
            </View>

            {meal.items.map((item, index) => (
              <View style={styles.foodCard} key={`food-${index}`}>
                <View style={styles.foodCardHeader}>
                  <View style={styles.itemNumberBadge}>
                    <Text style={styles.foodNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>

                  <Text style={styles.itemLabel}>FOOD ITEM</Text>

                  <Pressable
                    onPress={() => removeItem(index)}
                    style={styles.removeButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                  >
                    <Trash2 size={16} color={C.danger} />
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>

                <Text style={styles.inputLabel}>FOOD NAME</Text>
                <TextInput
                  style={styles.input}
                  value={item.name}
                  onChangeText={(value) => updateItem(index, "name", value)}
                  placeholder="Food name"
                  placeholderTextColor={C.muted}
                />

                <Text style={styles.inputLabel}>PORTION SIZE</Text>

                <View style={styles.quantityInputRow}>
                  <TextInput
                    style={styles.quantityInput}
                    value={String(item.quantity_g)}
                    onChangeText={(value) =>
                      updateItem(index, "quantity_g", value)
                    }
                    keyboardType="decimal-pad"
                    placeholder="Quantity"
                    placeholderTextColor={C.muted}
                  />

                  <Text style={styles.unitBadge}>GRAMS</Text>
                </View>

                <Text style={styles.inputLabel}>NUTRITION VALUES</Text>

                <View style={styles.nutritionGrid}>
                  {(
                    [
                      ["Calories (kcal)", "calories"],
                      ["Protein (g)", "protein"],
                      ["Carbs (g)", "carbs"],
                      ["Fat (g)", "fat"],
                      ["Fiber (g)", "fiber"],
                    ] as const
                  ).map(([label, field]) => (
                    <View style={styles.nutritionInput} key={field}>
                      <Text style={styles.inputLabel}>{label}</Text>

                      <TextInput
                        style={styles.input}
                        value={String(item[field])}
                        onChangeText={(value) =>
                          updateItem(index, field, value)
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={C.muted}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <Pressable
              style={styles.addFoodButton}
              onPress={() => setShowAddForm((visible) => !visible)}
            >
              <View style={styles.addFoodIcon}>
                {showAddForm ? (
                  <X size={20} color={C.bg} />
                ) : (
                  <Plus size={21} color={C.bg} />
                )}
              </View>

              <View style={styles.addFoodTextContainer}>
                <Text style={styles.addFoodTitle}>
                  {showAddForm ? "Cancel adding food" : "Missing something?"}
                </Text>

                <Text style={styles.addFoodSubtitle}>
                  Add another food item manually
                </Text>
              </View>

              <ChevronRight
                size={18}
                color={C.accent}
                style={
                  showAddForm ? { transform: [{ rotate: "90deg" }] } : undefined
                }
              />
            </Pressable>

            {showAddForm && (
              <View style={styles.addForm}>
                <Text style={styles.addFormTitle}>Add a food item</Text>

                <Text style={styles.formHint}>
                  Enter nutrition for the full portion you specify.
                </Text>

                <Text style={styles.inputLabel}>FOOD NAME *</Text>
                <TextInput
                  style={styles.input}
                  value={newFood.name}
                  onChangeText={(value) => updateNewFood("name", value)}
                  placeholder="e.g. Chapati"
                  placeholderTextColor={C.muted}
                />

                <Text style={styles.inputLabel}>QUANTITY (G) *</Text>
                <TextInput
                  style={styles.input}
                  value={newFood.quantity_g}
                  onChangeText={(value) => updateNewFood("quantity_g", value)}
                  keyboardType="decimal-pad"
                  placeholder="100"
                  placeholderTextColor={C.muted}
                />

                <View style={styles.nutritionGrid}>
                  {renderNutritionInput("Calories (kcal) *", "calories", "0")}
                  {renderNutritionInput("Protein (g) *", "protein", "0")}
                  {renderNutritionInput("Carbs (g) *", "carbs", "0")}
                  {renderNutritionInput("Fat (g) *", "fat", "0")}
                  {renderNutritionInput("Fiber (g) *", "fiber", "0")}
                </View>

                <Pressable style={styles.primaryButton} onPress={addFoodItem}>
                  <Plus size={18} color={C.bg} />
                  <Text style={styles.primaryButtonText}>Add to meal</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>03</Text>
              </View>

              <View style={styles.stepText}>
                <Text style={styles.sectionTitle}>Meal nutrition</Text>
                <Text style={styles.hint}>
                  Combined estimates for all listed foods
                </Text>
              </View>
            </View>

            <View style={styles.totalsCard}>
              <View style={styles.caloriePanel}>
                <View style={styles.calorieIcon}>
                  <Flame size={21} color={C.accent} />
                </View>

                <Text style={styles.totalLabel}>TOTAL CALORIES</Text>

                <View style={styles.calorieRow}>
                  <Text style={styles.calorieValue}>
                    {Math.round(totals.calories)}
                  </Text>
                  <Text style={styles.calorieUnit}>kcal</Text>
                </View>
              </View>

              <View style={styles.totalMacros}>
                <View style={styles.macro}>
                  <Beef size={17} color={C.accent} />
                  <Text style={styles.macroValue}>
                    {totals.protein.toFixed(1)} g
                  </Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>

                <View style={styles.macro}>
                  <Wheat size={17} color="#E8C477" />
                  <Text style={styles.macroValue}>
                    {totals.carbs.toFixed(1)} g
                  </Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>

                <View style={styles.macro}>
                  <Droplets size={17} color="#8BCBFF" />
                  <Text style={styles.macroValue}>
                    {totals.fat.toFixed(1)} g
                  </Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>

                <View style={styles.macro}>
                  <Leaf size={17} color="#9EE0B0" />
                  <Text style={styles.macroValue}>
                    {totals.fiber.toFixed(1)} g
                  </Text>
                  <Text style={styles.macroLabel}>Fiber</Text>
                </View>
              </View>

              <Text style={styles.disclaimer}>
                These values are estimates, not laboratory measurements.
              </Text>
            </View>

            <Pressable
              style={[
                styles.primaryButton,
                (saving || analyzing || meal.items.length === 0) &&
                  styles.disabledButton,
              ]}
              onPress={saveMeal}
              disabled={saving || analyzing || meal.items.length === 0}
            >
              {saving ? (
                <>
                  <ActivityIndicator color={C.bg} />
                  <Text style={styles.primaryButtonText}>Saving meal...</Text>
                </>
              ) : (
                <>
                  <CheckCircle2 size={19} color={C.bg} />
                  <Text style={styles.primaryButtonText}>
                    Save meal to today
                  </Text>
                </>
              )}
            </Pressable>
          </View>
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
          <Text style={styles.footerText}>
            SMALL STEPS. CONSISTENT PROGRESS.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const C = {
  bg: "#101010",
  card: "#1A1A1A",
  cardAlt: "#222222",
  accent: "#B6F36B",
  text: "#F5F5F5",
  muted: "#969696",
  border: "#303030",
  danger: "#FF7777",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 36,
    gap: 18,
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
  headerText: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
  },
  headerTitle: {
    color: C.text,
    fontSize: 23,
    fontWeight: "800",
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
    marginTop: 8,
    marginBottom: 2,
  },
  title: {
    color: C.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  accent: {
    color: C.accent,
  },
  subtitle: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
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
    color: C.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  stepText: {
    flex: 1,
    gap: 3,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "700",
  },
  hint: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  photoCard: {
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    gap: 12,
  },
  photoPlaceholder: {
    minHeight: 190,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#454545",
    borderRadius: 15,
    backgroundColor: "#151515",
    gap: 10,
  },
  cameraCircle: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: "#242D1D",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  placeholderTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  placeholderText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  imageWrap: {
    position: "relative",
  },
  mealImage: {
    width: "100%",
    height: 245,
    borderRadius: 15,
    backgroundColor: C.cardAlt,
  },
  photoBadge: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#101010E8",
  },
  photoBadgeText: {
    color: C.text,
    fontSize: 11,
    fontWeight: "700",
  },
  removePhoto: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#101010E8",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 47,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: C.bg,
    fontSize: 14,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.45,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    padding: 16,
  },
  statusContent: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
  },
  results: {
    gap: 16,
    marginTop: 8,
  },
  mealSummary: {
    padding: 15,
    borderRadius: 17,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  summaryIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: "#242D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryInfo: {
    flex: 1,
    gap: 4,
  },
  mealName: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
  },
  note: {
    color: C.accent,
    fontSize: 12,
    lineHeight: 18,
  },
  helperText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  foodCard: {
    padding: 15,
    borderRadius: 17,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: 5,
  },
  foodCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 6,
  },
  itemNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: "#242D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  foodNumber: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  itemLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    flex: 1,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 5,
  },
  removeText: {
    color: C.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  inputLabel: {
    color: "#B7B7B7",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 9,
    marginBottom: 5,
  },
  input: {
    backgroundColor: "#111111",
    borderColor: "#393939",
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: C.text,
    fontSize: 14,
    minHeight: 45,
  },
  quantityInputRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111111",
    borderColor: "#393939",
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  quantityInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingVertical: 11,
  },
  unitBadge: {
    color: C.accent,
    backgroundColor: "#242D1D",
    overflow: "hidden",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  nutritionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 4,
    marginTop: 2,
  },
  nutritionInput: {
    width: "47%",
    flexGrow: 1,
  },
  addFoodButton: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#526E38",
    backgroundColor: "#1A2415",
  },
  addFoodIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addFoodTextContainer: {
    flex: 1,
    gap: 4,
  },
  addFoodTitle: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  addFoodSubtitle: {
    color: C.muted,
    fontSize: 11,
  },
  addForm: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: "#526E38",
    borderRadius: 17,
    padding: 15,
    gap: 5,
  },
  addFormTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "800",
  },
  formHint: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 5,
  },
  totalsCard: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    gap: 14,
  },
  caloriePanel: {
    padding: 16,
    borderRadius: 16,
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
  totalLabel: {
    color: "#C4D5B0",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  calorieRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  calorieValue: {
    color: C.accent,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1,
  },
  calorieUnit: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  totalMacros: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  macro: {
    flex: 1,
    minWidth: "40%",
    padding: 12,
    borderRadius: 13,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    gap: 7,
  },
  macroValue: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
  },
  macroLabel: {
    color: C.muted,
    fontSize: 12,
  },
  disclaimer: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  cancelButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
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
    paddingTop: 2,
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
    letterSpacing: 1.2,
  },
});
