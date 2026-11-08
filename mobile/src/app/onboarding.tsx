import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { usePostHog } from "posthog-react-native";

import { supabase } from "../lib/supabase";
import { Sentry } from "../lib/sentry";
import { useAppDialog } from "../contexts/AppDialogContext";

const C = {
  background: "#101010",
  card: "#1A1A1A",
  input: "#141414",
  accent: "#B6F36B",
  text: "#FFFFFF",
  secondary: "#999999",
  muted: "#707070",
  border: "#303030",
};

const goals = [
  {
    value: "lose",
    label: "Lose weight",
    description: "Reduce body fat and lose weight",
    icon: "trending-down-outline" as const,
  },
  {
    value: "maintain",
    label: "Maintain weight",
    description: "Stay at your current weight",
    icon: "scale-outline" as const,
  },
  {
    value: "gain",
    label: "Gain weight",
    description: "Build weight and muscle",
    icon: "trending-up-outline" as const,
  },
];

const genders = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  {
    value: "prefer_not_to_say",
    label: "Prefer not to say",
  },
];

export default function OnboardingScreen() {
  const posthog = usePostHog();
  const { showDialog } = useAppDialog();

  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    posthog.capture("onboarding_started");

    Sentry.logger.info("Onboarding started", {
      operation: "onboarding",
    });
  }, [posthog]);

  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleDateChange = (
    event: { type: string },
    selectedDate?: Date,
  ) => {
    setShowDatePicker(false);

    if (event.type === "set" && selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");

      setBirthDate(`${year}-${month}-${day}`);
    }
  };

  const handleContinue = async () => {
    if (!birthDate || !gender || !height.trim() || !weight.trim() || !goal) {
      showDialog(
        "Missing information",
        "Please complete all fields before continuing.",
        [{ text: "Got it" }],
        { type: "warning" },
      );
      return;
    }

    const heightCm = Number(height);
    const weightKg = Number(weight);

    if (!Number.isFinite(heightCm) || heightCm <= 0) {
      showDialog(
        "Invalid height",
        "Please enter a valid height in centimetres.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      showDialog(
        "Invalid weight",
        "Please enter a valid weight in kilograms.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (loading) return;

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Sentry.logger.warn("Onboarding failed: no active session", {
          operation: "onboarding",
          stage: "session_lookup",
        });

        posthog.capture("onboarding_failed", {
          failure_stage: "session_lookup",
        });

        showDialog(
          "Session expired",
          "Please log in again to continue setting up your profile.",
          [
            {
              text: "Log in",
              onPress: () => router.replace("/login"),
            },
          ],
          { type: "error" },
        );
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          birth_date: birthDate,
          gender,
          height_cm: heightCm,
          weight_kg: weightKg,
          goal,
        })
        .eq("id", user.id);

      if (error) {
        Sentry.logger.error("Onboarding profile save failed", {
          operation: "onboarding",
          stage: "profile_update",
        });

        Sentry.captureException(error);

        posthog.capture("onboarding_failed", {
          failure_stage: "profile_update",
        });

        showDialog(
          "Could not save profile",
          "We couldn't save your profile details. Please try again.",
          [{ text: "OK" }],
          { type: "error" },
        );
        return;
      }

      Sentry.logger.info("Onboarding completed", {
        operation: "onboarding",
      });

      posthog.capture("onboarding_completed");

      router.replace("/calorie-goal");
    } catch (error) {
      Sentry.logger.error("Unexpected onboarding error", {
        operation: "onboarding",
      });

      Sentry.captureException(error);

      posthog.capture("onboarding_failed", {
        failure_stage: "unexpected_error",
      });

      showDialog(
        "Something went wrong",
        "We couldn't complete your profile setup. Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={
          Platform.OS === "ios" ? "interactive" : "on-drag"
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="nutrition" size={25} color={C.background} />
          </View>

          <Text style={styles.brandName}>
            Bite<Text style={styles.brandAccent}>Log</Text>
          </Text>
        </View>

        {/* Heading */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>LET'S GET STARTED</Text>

          <Text style={styles.title}>Build your{"\n"}personal profile.</Text>

          <Text style={styles.subtitle}>
            A few details will help us personalize your calorie goals and track
            your progress.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Date of birth */}
          <Text style={styles.label}>Date of birth</Text>

          <Pressable
            style={styles.inputContainer}
            onPress={() => setShowDatePicker(true)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Select date of birth"
          >
            <Ionicons name="calendar-outline" size={19} color={C.muted} />

            <Text style={[styles.input, !birthDate && styles.placeholderText]}>
              {birthDate
                ? formatDateForDisplay(birthDate)
                : "Select your date of birth"}
            </Text>

            <Ionicons name="chevron-down" size={18} color={C.muted} />
          </Pressable>

          {showDatePicker && (
            <DateTimePicker
              value={
                birthDate
                  ? (() => {
                      const [year, month, day] = birthDate
                        .split("-")
                        .map(Number);

                      return new Date(year, month - 1, day);
                    })()
                  : new Date(2000, 0, 1)
              }
              mode="date"
              display={Platform.OS === "ios" ? "compact" : "default"}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
              onChange={handleDateChange}
            />
          )}

          {/* Gender */}
          <Text style={styles.label}>Gender</Text>

          <View style={styles.genderGrid}>
            {genders.map((item) => {
              const selected = gender === item.value;

              return (
                <Pressable
                  key={item.value}
                  style={[
                    styles.genderOption,
                    selected && styles.optionSelected,
                  ]}
                  onPress={() => setGender(item.value)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.genderText,
                      selected && styles.optionTextSelected,
                    ]}
                  >
                    {item.label}
                  </Text>

                  {selected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={17}
                      color={C.accent}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Height */}
          <Text style={styles.label}>Height</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="resize-outline" size={19} color={C.muted} />

            <TextInput
              style={styles.input}
              placeholder="Enter your height"
              placeholderTextColor={C.muted}
              value={height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
              editable={!loading}
              returnKeyType="next"
            />

            <View style={styles.unitBadge}>
              <Text style={styles.unitText}>cm</Text>
            </View>
          </View>

          {/* Weight */}
          <Text style={styles.label}>Weight</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="barbell-outline" size={19} color={C.muted} />

            <TextInput
              style={styles.input}
              placeholder="Enter your weight"
              placeholderTextColor={C.muted}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />

            <View style={styles.unitBadge}>
              <Text style={styles.unitText}>kg</Text>
            </View>
          </View>

          {/* Goal */}
          <Text style={styles.label}>What is your goal?</Text>

          <View style={styles.goalContainer}>
            {goals.map((item) => {
              const selected = goal === item.value;

              return (
                <Pressable
                  key={item.value}
                  style={[
                    styles.goalOption,
                    selected && styles.goalOptionSelected,
                  ]}
                  onPress={() => setGoal(item.value)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View
                    style={[
                      styles.goalIcon,
                      selected && styles.goalIconSelected,
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={21}
                      color={selected ? C.background : C.secondary}
                    />
                  </View>

                  <View style={styles.goalInfo}>
                    <Text
                      style={[
                        styles.goalTitle,
                        selected && styles.goalTitleSelected,
                      ]}
                    >
                      {item.label}
                    </Text>

                    <Text style={styles.goalDescription}>
                      {item.description}
                    </Text>
                  </View>

                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={21}
                    color={selected ? C.accent : C.muted}
                  />
                </Pressable>
              );
            })}
          </View>

          {/* Continue */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleContinue}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.background} />
            ) : (
              <>
                <Text style={styles.buttonText}>Continue</Text>

                <Ionicons name="arrow-forward" size={19} color={C.background} />
              </>
            )}
          </Pressable>

          {/* Privacy Footer */}
          <View style={styles.footer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color={C.muted}
            />

            <Text style={styles.footerText}>
              Your information stays private.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 26,
    paddingTop: 45,
    paddingBottom: 35,
  },

  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 38,
  },

  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  brandName: {
    color: C.text,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  brandAccent: {
    color: C.accent,
  },

  header: {
    marginBottom: 27,
  },

  eyebrow: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    marginBottom: 11,
  },

  title: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "900",
    letterSpacing: -1,
    color: C.text,
  },

  subtitle: {
    marginTop: 11,
    fontSize: 13,
    lineHeight: 21,
    color: C.secondary,
  },

  form: {
    width: "100%",
  },

  label: {
    marginBottom: 9,
    marginTop: 19,
    fontSize: 12,
    fontWeight: "700",
    color: C.text,
  },

  inputContainer: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.input,
  },

  input: {
    flex: 1,
    height: 52,
    fontSize: 14,
    color: C.text,
    paddingVertical: 0,
    textAlignVertical: "center",
  },

  placeholderText: {
    color: C.muted,
  },

  unitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#252D20",
  },

  unitText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "800",
  },

  genderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },

  genderOption: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },

  optionSelected: {
    borderColor: C.accent,
    backgroundColor: "#252D20",
  },

  genderText: {
    color: C.secondary,
    fontSize: 12,
    fontWeight: "600",
  },

  optionTextSelected: {
    color: C.accent,
    fontWeight: "800",
  },

  goalContainer: {
    gap: 10,
  },

  goalOption: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.card,
  },

  goalOptionSelected: {
    borderColor: C.accent,
    backgroundColor: "#20271A",
  },

  goalIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#292929",
    alignItems: "center",
    justifyContent: "center",
  },

  goalIconSelected: {
    backgroundColor: C.accent,
  },

  goalInfo: {
    flex: 1,
  },

  goalTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
  },

  goalTitleSelected: {
    color: C.accent,
  },

  goalDescription: {
    color: C.secondary,
    fontSize: 10,
    marginTop: 4,
  },

  button: {
    height: 55,
    marginTop: 30,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.accent,
  },

  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonText: {
    color: C.background,
    fontSize: 15,
    fontWeight: "900",
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 23,
  },

  footerText: {
    color: C.muted,
    fontSize: 10,
  },
});
