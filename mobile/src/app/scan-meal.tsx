import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef } from "react";
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  ArrowLeft,
  Beef,
  Camera,
  Check,
  CheckCircle2,
  Droplets,
  Flame,
  ImagePlus,
  Leaf,
  ScanLine,
  Trash2,
  Utensils,
  Wheat,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../lib/sentry";
import { useAppDialog } from "../contexts/AppDialogContext";
import FoodLoadingOverlay from "../components/FoodLoadingOverlay";
import AnimatedNumber from "../components/AnimatedNumber";

/* ------------------------------------------------------------------ */
/* Types & helpers                                                      */
/* ------------------------------------------------------------------ */

type RawMealItem = {
  name: string;
  quantity_g: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type NumericField =
  | "quantity_g"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber";

type NutritionField = Exclude<NumericField, "quantity_g">;

const NUTRITION_FIELDS: NutritionField[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "fiber",
];

const NUTRITION_LABELS: Record<NutritionField, string> = {
  calories: "Calories (kcal)",
  protein: "Protein (g)",
  carbs: "Carbs (g)",
  fat: "Fat (g)",
  fiber: "Fiber (g)",
};

/**
 * One editable food item.
 *
 * `values` is exactly what the text inputs show (so typing "1." works).
 * `anchor` is the reference used to scale nutrition when the portion
 * changes. It starts as the AI estimate and is re-based whenever the
 * user edits a nutrition value by hand.
 */
type EditableItem = {
  id: string;
  name: string;
  values: Record<NumericField, string>;
  anchor: Record<NumericField, number>;
};

type EditableMeal = {
  meal_name: string;
  notes: string;
  items: EditableItem[];
};

type Phase = "analyze" | "save";

const PHASE_COPY: Record<Phase, { title: string; messages: string[] }> = {
  analyze: {
    title: "Analyzing your meal",
    messages: [
      "Looking at your plate...",
      "Identifying each food...",
      "Estimating portion sizes...",
      "Counting calories and macros...",
    ],
  },
  save: {
    title: "Saving your meal",
    messages: [
      "Adding it to today's log...",
      "Updating your progress...",
      "Checking for rewards...",
    ],
  },
};

/** The analyze-meal function rejects images above 12M base64 characters. */
const MAX_BASE64_LENGTH = 11_000_000;

let itemCounter = 0;
const nextItemId = () => `item-${Date.now()}-${itemCounter++}`;

/** Text -> number. Empty or invalid text counts as 0. */
const num = (text: string) => {
  const value = Number(text.trim() === "" ? "0" : text);
  return Number.isFinite(value) ? value : 0;
};

const formatValue = (value: number) => String(Math.round(value * 10) / 10);

const localDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function createItem(raw: Partial<RawMealItem>): EditableItem {
  const anchor: Record<NumericField, number> = {
    quantity_g: Number(raw.quantity_g) || 0,
    calories: Number(raw.calories) || 0,
    protein: Number(raw.protein) || 0,
    carbs: Number(raw.carbs) || 0,
    fat: Number(raw.fat) || 0,
    fiber: Number(raw.fiber) || 0,
  };

  return {
    id: nextItemId(),
    name: String(raw.name || ""),
    anchor,
    values: {
      quantity_g: formatValue(anchor.quantity_g),
      calories: formatValue(anchor.calories),
      protein: formatValue(anchor.protein),
      carbs: formatValue(anchor.carbs),
      fat: formatValue(anchor.fat),
      fiber: formatValue(anchor.fiber),
    },
  };
}

/** Smoothly animates the next layout change (results appearing, etc.). */
function smooth() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(260, "easeInEaseOut", "opacity"),
  );
}

/* ------------------------------------------------------------------ */
/* "Analyze" confirm button shown on the photo                          */
/* ------------------------------------------------------------------ */

function ConfirmPill({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled: boolean;
}) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  return (
    <Animated.View
      style={[
        styles.confirmWrap,
        {
          opacity: scale.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: "clamp",
          }),
          transform: [{ scale }],
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.confirmPill, pressed && styles.pressed]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Analyze this photo"
      >
        <Check size={18} color={C.bg} strokeWidth={3} />
        <Text style={styles.confirmText}>Analyze</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

export default function ScanMealScreen() {
  const posthog = usePostHog();
  const { showDialog } = useAppDialog();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollToResultsRef = useRef(false);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [meal, setMeal] = useState<EditableMeal | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Not reset after loading, so the text doesn't change while the overlay fades out.
  const [phase, setPhase] = useState<Phase>("analyze");

  const busy = analyzing || saving;

  // Live totals: recalculated on every edit, so the preview always matches.
  const totals = useMemo(() => {
    const items = meal?.items ?? [];

    return items.reduce(
      (sum, item) => ({
        calories: sum.calories + num(item.values.calories),
        protein: sum.protein + num(item.values.protein),
        carbs: sum.carbs + num(item.values.carbs),
        fat: sum.fat + num(item.values.fat),
        fiber: sum.fiber + num(item.values.fiber),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );
  }, [meal]);

  /* ---------------------------- photo ---------------------------- */

  const pickImage = async (useCamera: boolean) => {
    if (busy) return;

    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showDialog(
          "Permission needed",
          useCamera
            ? "Allow camera access to take a photo of your meal."
            : "Allow photo library access to select a meal image.",
          [{ text: "OK" }],
          { type: "warning" },
        );
        return;
      }

      // No native crop step: the photo comes straight back and the
      // user confirms with the Analyze button.
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.6,
        base64: true,
      };

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        showDialog(
          "Could not read image",
          "Please select another photo and try again.",
          [{ text: "OK" }],
          { type: "error" },
        );
        return;
      }

      if (asset.base64.length > MAX_BASE64_LENGTH) {
        showDialog(
          "Photo is too large",
          "Please choose a smaller photo or take a new one.",
          [{ text: "OK" }],
          { type: "warning" },
        );
        return;
      }

      smooth();
      setImageUri(asset.uri);
      setImageBase64(asset.base64);
      setMimeType(asset.mimeType || "image/jpeg");
      setMeal(null);

      posthog.capture("meal_photo_selected", {
        source: useCamera ? "camera" : "gallery",
      });
    } catch (error) {
      Sentry.logger.error("Meal image picker failed", {
        operation: "meal_image_picker",
        source: useCamera ? "camera" : "gallery",
      });
      Sentry.captureException(error);
      posthog.capture("meal_image_picker_failed", {
        source: useCamera ? "camera" : "gallery",
      });

      showDialog(
        "Unable to open images",
        "Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    }
  };

  const removePhoto = () => {
    smooth();
    setImageUri(null);
    setImageBase64(null);
    setMeal(null);
  };

  /* --------------------------- analysis -------------------------- */

  const analyzeMeal = async () => {
    if (!imageBase64) {
      showDialog(
        "Select a photo",
        "Take a photo or choose one from your gallery first.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (busy) return;

    Keyboard.dismiss();
    setPhase("analyze");
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

      const normalizedMeal: EditableMeal = {
        meal_name: String(data.meal.meal_name || "Scanned meal"),
        notes: data.meal.notes ? String(data.meal.notes) : "",
        items: data.meal.items.map((item: Partial<RawMealItem>) =>
          createItem(item),
        ),
      };

      smooth();
      scrollToResultsRef.current = true;
      setMeal(normalizedMeal);

      Sentry.logger.info("Meal analysis completed", {
        operation: "meal_analysis",
      });

      posthog.capture("meal_scan_completed");

      if (normalizedMeal.items.length === 0) {
        scrollToResultsRef.current = false;

        showDialog(
          "No food detected",
          "Try a clearer photo with the food visible from above.",
          [{ text: "OK" }],
          { type: "warning" },
        );
      }
    } catch (error) {
      Sentry.logger.error("Meal analysis failed", {
        operation: "meal_analysis",
      });
      Sentry.captureException(error);
      posthog.capture("meal_scan_failed");

      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while analyzing your meal.";

      showDialog("Could not analyze meal", message, [{ text: "OK" }], {
        type: "error",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // After the results appear, scroll them into view once.
  const handleResultsLayout = (event: LayoutChangeEvent) => {
    if (!scrollToResultsRef.current) return;

    scrollToResultsRef.current = false;

    scrollRef.current?.scrollTo({
      y: Math.max(event.nativeEvent.layout.y - 12, 0),
      animated: true,
    });
  };

  /* ---------------------------- editing -------------------------- */

  const updateName = (id: string, value: string) => {
    setMeal((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === id ? { ...item, name: value } : item,
            ),
          }
        : current,
    );
  };

  const updateValue = (id: string, field: NumericField, rawText: string) => {
    const text = rawText.replace(",", ".");

    // Only digits and a single decimal point.
    if (!/^\d*\.?\d*$/.test(text) || text.length > 8) return;

    setMeal((current) => {
      if (!current) return current;

      return {
        ...current,
        items: current.items.map((item) => {
          if (item.id !== id) return item;

          const values: Record<NumericField, string> = {
            ...item.values,
            [field]: text,
          };

          // Portion changed: scale every nutrition value proportionally.
          if (field === "quantity_g") {
            const quantity = num(text);

            if (quantity > 0 && item.anchor.quantity_g > 0) {
              const ratio = quantity / item.anchor.quantity_g;

              for (const nutrient of NUTRITION_FIELDS) {
                values[nutrient] = formatValue(item.anchor[nutrient] * ratio);
              }
            }

            return { ...item, values };
          }

          // A nutrition value was edited by hand: use the current numbers
          // as the new baseline for future portion changes.
          const quantity = num(values.quantity_g);

          return {
            ...item,
            values,
            anchor: {
              quantity_g: quantity > 0 ? quantity : item.anchor.quantity_g,
              calories: num(values.calories),
              protein: num(values.protein),
              carbs: num(values.carbs),
              fat: num(values.fat),
              fiber: num(values.fiber),
            },
          };
        }),
      };
    });
  };

  const removeItem = (id: string) => {
    smooth();
    setMeal((current) =>
      current
        ? {
            ...current,
            items: current.items.filter((item) => item.id !== id),
          }
        : current,
    );
  };

  /* ----------------------------- save ---------------------------- */

  const saveMeal = async () => {
    if (!meal || meal.items.length === 0) {
      showDialog(
        "Nothing to save",
        "Analyze a photo first to get food items.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (busy) return;

    const payload = meal.items.map((item) => ({
      name: item.name.trim(),
      quantity_g: num(item.values.quantity_g),
      calories: num(item.values.calories),
      protein: num(item.values.protein),
      carbs: num(item.values.carbs),
      fat: num(item.values.fat),
      fiber: num(item.values.fiber),
    }));

    const invalidItem = payload.find(
      (item) => !item.name || item.quantity_g <= 0,
    );

    if (invalidItem) {
      showDialog(
        "Check your food items",
        "Every item needs a name and a portion greater than zero.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    Keyboard.dismiss();
    setPhase("save");
    setSaving(true);
    posthog.capture("ai_meal_save_started");

    try {
      const { data, error } = await supabase.functions.invoke("save-ai-meal", {
        body: {
          log_date: localDate(),
          meal_name: meal.meal_name?.trim() || "Scanned meal",
          items: payload,
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

      showDialog(
        "Meal saved",
        "Your scanned meal has been added to today's food log.",
        [
          {
            text: "Done",
            onPress: () => router.back(),
          },
        ],
        { type: "success", cancelable: false },
      );
    } catch (error) {
      Sentry.logger.error("AI meal save failed", {
        operation: "save_ai_meal",
      });
      Sentry.captureException(error);
      posthog.capture("ai_meal_save_failed");

      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while saving your meal.";

      showDialog("Could not save meal", message, [{ text: "OK" }], {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const phaseCopy = PHASE_COPY[phase];
  const hasPhoto = !!imageUri;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
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
            <Text style={styles.hint}>
              {hasPhoto
                ? "Happy with it? Tap Analyze"
                : "Use a clear photo from above"}
            </Text>
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
                onPress={removePhoto}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Remove selected photo"
              >
                <X size={18} color={C.text} />
              </Pressable>

              {!meal && <ConfirmPill onPress={analyzeMeal} disabled={busy} />}
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
              disabled={busy}
            >
              <Camera size={18} color={C.text} />
              <Text style={styles.secondaryButtonText}>
                {hasPhoto ? "Retake" : "Camera"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.secondaryButton}
              onPress={() => pickImage(false)}
              disabled={busy}
            >
              <ImagePlus size={18} color={C.text} />
              <Text style={styles.secondaryButtonText}>
                {hasPhoto ? "Change photo" : "Gallery"}
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            (!imageBase64 || busy) && styles.disabledButton,
            pressed && styles.pressed,
          ]}
          onPress={analyzeMeal}
          disabled={!imageBase64 || busy}
        >
          {hasPhoto ? (
            <Check size={19} color={C.bg} strokeWidth={3} />
          ) : (
            <ScanLine size={19} color={C.bg} />
          )}
          <Text style={styles.primaryButtonText}>
            {meal
              ? "Analyze again"
              : hasPhoto
                ? "Analyze this photo"
                : "Analyze with AI"}
          </Text>
        </Pressable>

        {meal && (
          <View style={styles.results} onLayout={handleResultsLayout}>
            <View style={styles.stepHeader}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>02</Text>
              </View>

              <View style={styles.stepText}>
                <Text style={styles.sectionTitle}>Review your meal</Text>
                <Text style={styles.hint}>
                  Change a portion and its nutrition updates automatically
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

            {meal.items.length === 0 && (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>All items removed</Text>
                <Text style={styles.emptyText}>
                  Choose another photo or analyze this one again.
                </Text>
              </View>
            )}

            {meal.items.map((item, index) => (
              <View style={styles.foodCard} key={item.id}>
                <View style={styles.foodCardHeader}>
                  <View style={styles.itemNumberBadge}>
                    <Text style={styles.foodNumber}>
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>

                  <Text style={styles.itemLabel}>FOOD ITEM</Text>

                  <View style={styles.kcalChip}>
                    <Flame size={12} color={C.accent} />
                    <Text style={styles.kcalChipText}>
                      {Math.round(num(item.values.calories))} kcal
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => removeItem(item.id)}
                    style={styles.removeButton}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.name}`}
                  >
                    <Trash2 size={16} color={C.danger} />
                  </Pressable>
                </View>

                <Text style={styles.inputLabel}>FOOD NAME</Text>
                <TextInput
                  style={styles.input}
                  value={item.name}
                  onChangeText={(value) => updateName(item.id, value)}
                  placeholder="Food name"
                  placeholderTextColor={C.muted}
                  editable={!busy}
                />

                <Text style={styles.inputLabel}>PORTION SIZE</Text>

                <View style={styles.quantityInputRow}>
                  <TextInput
                    style={styles.quantityInput}
                    value={item.values.quantity_g}
                    onChangeText={(value) =>
                      updateValue(item.id, "quantity_g", value)
                    }
                    keyboardType="decimal-pad"
                    placeholder="Quantity"
                    placeholderTextColor={C.muted}
                    editable={!busy}
                  />

                  <Text style={styles.unitBadge}>GRAMS</Text>
                </View>

                <Text style={styles.inputLabel}>NUTRITION VALUES</Text>
                <Text style={styles.fieldHint}>
                  Updates with the portion. Edit a value to correct it.
                </Text>

                <View style={styles.nutritionGrid}>
                  {NUTRITION_FIELDS.map((field) => (
                    <View style={styles.nutritionInput} key={field}>
                      <Text style={styles.inputLabel}>
                        {NUTRITION_LABELS[field]}
                      </Text>

                      <TextInput
                        style={styles.input}
                        value={item.values[field]}
                        onChangeText={(value) =>
                          updateValue(item.id, field, value)
                        }
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={C.muted}
                        editable={!busy}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {meal.items.length > 0 && (
              <>
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
                      <AnimatedNumber
                        value={totals.calories}
                        duration={450}
                        style={styles.calorieValue}
                      />
                      <Text style={styles.calorieUnit}>kcal</Text>
                    </View>
                  </View>

                  <View style={styles.totalMacros}>
                    <View style={styles.macro}>
                      <Beef size={17} color={C.accent} />
                      <Text style={styles.macroValue}>
                        <AnimatedNumber
                          value={totals.protein}
                          decimals={1}
                          duration={450}
                        />{" "}
                        g
                      </Text>
                      <Text style={styles.macroLabel}>Protein</Text>
                    </View>

                    <View style={styles.macro}>
                      <Wheat size={17} color="#E8C477" />
                      <Text style={styles.macroValue}>
                        <AnimatedNumber
                          value={totals.carbs}
                          decimals={1}
                          duration={450}
                        />{" "}
                        g
                      </Text>
                      <Text style={styles.macroLabel}>Carbs</Text>
                    </View>

                    <View style={styles.macro}>
                      <Droplets size={17} color="#8BCBFF" />
                      <Text style={styles.macroValue}>
                        <AnimatedNumber
                          value={totals.fat}
                          decimals={1}
                          duration={450}
                        />{" "}
                        g
                      </Text>
                      <Text style={styles.macroLabel}>Fat</Text>
                    </View>

                    <View style={styles.macro}>
                      <Leaf size={17} color="#9EE0B0" />
                      <Text style={styles.macroValue}>
                        <AnimatedNumber
                          value={totals.fiber}
                          decimals={1}
                          duration={450}
                        />{" "}
                        g
                      </Text>
                      <Text style={styles.macroLabel}>Fiber</Text>
                    </View>
                  </View>

                  <Text style={styles.disclaimer}>
                    These values are estimates, not laboratory measurements.
                    Saving adds them to your daily calories and macros.
                  </Text>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    busy && styles.disabledButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={saveMeal}
                  disabled={busy}
                >
                  <CheckCircle2 size={19} color={C.bg} />
                  <Text style={styles.primaryButtonText}>
                    Save meal to today
                  </Text>
                </Pressable>
              </>
            )}
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

      <FoodLoadingOverlay
        visible={analyzing || saving}
        title={phaseCopy.title}
        messages={phaseCopy.messages}
      />
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
  pressed: {
    opacity: 0.8,
  },

  /* Photo */
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
  confirmWrap: {
    position: "absolute",
    right: 10,
    bottom: 10,
  },
  confirmPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 12,
    paddingRight: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: C.accent,
    shadowColor: C.accent,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  confirmText: {
    color: C.bg,
    fontSize: 14,
    fontWeight: "900",
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

  /* Results */
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
  emptyCard: {
    alignItems: "center",
    padding: 22,
    borderRadius: 17,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  emptyTitle: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
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
  kcalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: "#242D1D",
  },
  kcalChipText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#332222",
    alignItems: "center",
    justifyContent: "center",
  },
  inputLabel: {
    color: "#B7B7B7",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 9,
    marginBottom: 5,
  },
  fieldHint: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -2,
    marginBottom: 2,
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
