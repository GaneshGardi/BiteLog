
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

import { supabase } from "../lib/supabase";

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

export default function CalorieGoalScreen() {
  const [calories, setCalories] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const dailyCalories = Number(calories);

    if (!dailyCalories || dailyCalories <= 0) {
      Alert.alert(
        "Invalid calorie goal",
        "Please enter a valid daily calorie goal."
      );
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert(
          "Session error",
          "Please log in again."
        );
        return;
      }

      const { error } = await supabase
        .from("calorie_goals")
        .insert({
          user_id: user.id,
          daily_calories: dailyCalories,
          effective_at: new Date().toISOString(),
        });

      if (error) {
        console.error("Failed to save calorie goal:", error);

        Alert.alert(
          "Could not save goal",
          error.message
        );
        return;
      }

      router.replace("/");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons
              name="nutrition"
              size={25}
              color={C.background}
            />
          </View>

          <Text style={styles.brandName}>
            fun<Text style={styles.brandAccent}>tracker</Text>
          </Text>
        </View>

        {/* Heading */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            ONE LAST STEP
          </Text>

          <Text style={styles.title}>
            Set your daily{"\n"}calorie goal.
          </Text>

          <Text style={styles.subtitle}>
            Choose your daily calorie target. We'll use it
            to help you monitor your progress every day.
          </Text>
        </View>

        {/* Calorie input card */}
        <View style={styles.goalCard}>
          <View style={styles.calorieIcon}>
            <Ionicons
              name="flame"
              size={25}
              color={C.accent}
            />
          </View>

          <Text style={styles.cardLabel}>
            YOUR DAILY TARGET
          </Text>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="2200"
              placeholderTextColor="#555555"
              keyboardType="numeric"
              value={calories}
              onChangeText={setCalories}
              editable={!saving}
              maxLength={5}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />

            <Text style={styles.unit}>
              kcal
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.dailyInfo}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={C.secondary}
            />

            <Text style={styles.dailyInfoText}>
              Your target will be tracked daily.
            </Text>
          </View>
        </View>

        {/* Information */}
        <View style={styles.infoCard}>
          <Ionicons
            name="information-circle-outline"
            size={19}
            color={C.accent}
          />

          <Text style={styles.infoText}>
            You can update your calorie goal later as your
            fitness goals and progress change.
          </Text>
        </View>

        {/* Save button */}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            saving && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={C.background} />
          ) : (
            <>
              <Text style={styles.buttonText}>
                Save & Continue
              </Text>

              <Ionicons
                name="arrow-forward"
                size={19}
                color={C.background}
              />
            </>
          )}
        </Pressable>

        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons
            name="shield-checkmark-outline"
            size={14}
            color={C.muted}
          />

          <Text style={styles.footerText}>
            Your goals. Your progress. Your journey.
          </Text>
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
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingTop: 45,
    paddingBottom: 35,
  },

  // Brand
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 42,
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

  // Heading
  header: {
    marginBottom: 30,
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
    marginTop: 12,
    fontSize: 13,
    lineHeight: 21,
    color: C.secondary,
  },

  // Goal card
  goalCard: {
    padding: 21,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },

  calorieIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#252D20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },

  cardLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: C.secondary,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },

  input: {
    flex: 1,
    paddingVertical: 5,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.5,
    color: C.text,
  },

  unit: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 10,
  },

  divider: {
    height: 1,
    backgroundColor: C.border,
    marginTop: 17,
    marginBottom: 15,
  },

  dailyInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  dailyInfoText: {
    color: C.secondary,
    fontSize: 11,
  },

  // Information card
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    marginTop: 17,
    borderRadius: 12,
    backgroundColor: "#1B2117",
    borderWidth: 1,
    borderColor: "#303B28",
  },

  infoText: {
    flex: 1,
    color: C.secondary,
    fontSize: 11,
    lineHeight: 18,
  },

  // Button
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

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 25,
  },

  footerText: {
    color: C.muted,
    fontSize: 10,
  },
});
