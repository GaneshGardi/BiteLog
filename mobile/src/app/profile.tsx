import { useCallback, useEffect, useState } from "react";
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
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../lib/sentry";
import { useAppDialog } from "../contexts/AppDialogContext";

type Gender = "male" | "female" | "other" | "prefer_not_to_say";
type Goal = "lose" | "maintain" | "gain";

type ProfileData = {
  username: string;
  display_name: string;
  birth_date: string;
  gender: Gender | "";
  height_cm: string;
  weight_kg: string;
  goal: Goal | "";
};

const COLORS = {
  background: "#101010",
  card: "#1A1A1A",
  input: "#141414",
  accent: "#B6F36B",
  text: "#FFFFFF",
  secondary: "#A0A0A0",
  muted: "#707070",
  border: "#303030",
  danger: "#FF7777",
};

const initialProfile: ProfileData = {
  username: "",
  display_name: "",
  birth_date: "",
  gender: "",
  height_cm: "",
  weight_kg: "",
  goal: "",
};

const genderOptions: { label: string; value: Gender }[] = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Other", value: "other" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
];

const goalOptions: { label: string; value: Goal }[] = [
  { label: "Lose weight", value: "lose" },
  { label: "Maintain", value: "maintain" },
  { label: "Gain weight", value: "gain" },
];

export default function ProfileScreen() {
  const posthog = usePostHog();
  const { showDialog } = useAppDialog();
  const [profile, setProfile] = useState<ProfileData>(initialProfile);
  const [dailyCalories, setDailyCalories] = useState("");
  const [savedCalories, setSavedCalories] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCalories, setSavingCalories] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email ?? "");

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "username, display_name, birth_date, gender, height_cm, weight_kg, goal",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profileData) {
        setProfile({
          username: profileData.username ?? "",
          display_name: profileData.display_name ?? "",
          birth_date: profileData.birth_date ?? "",
          gender: profileData.gender ?? "",
          height_cm:
            profileData.height_cm != null ? String(profileData.height_cm) : "",
          weight_kg:
            profileData.weight_kg != null ? String(profileData.weight_kg) : "",
          goal: profileData.goal ?? "",
        });
      }

      const { data: calorieGoal, error: calorieError } = await supabase
        .from("calorie_goals")
        .select("daily_calories")
        .eq("user_id", user.id)
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (calorieError) throw calorieError;

      if (calorieGoal?.daily_calories != null) {
        const calories = Number(calorieGoal.daily_calories);
        setSavedCalories(calories);
        setDailyCalories(String(calories));
      }
    } catch (error) {
      Sentry.logger.error("Profile failed to load", {
        operation: "load_profile",
      });
      Sentry.captureException(error);
      posthog.capture("profile_load_failed");

      showDialog(
        "Unable to load profile",
        error instanceof Error
          ? error.message
          : "Something went wrong while loading your profile.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  }, [posthog, showDialog]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const updateField = <K extends keyof ProfileData>(
    field: K,
    value: ProfileData[K],
  ) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validateProfile = (): boolean => {
    const username = profile.username.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      showDialog(
        "Invalid username",
        "Use 3–24 characters: lowercase letters, numbers, and underscores only.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return false;
    }

    if (profile.birth_date.trim()) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;

      if (!datePattern.test(profile.birth_date.trim())) {
        showDialog(
          "Invalid birth date",
          "Enter your birth date in YYYY-MM-DD format, for example 2002-08-15.",
          [{ text: "OK" }],
          { type: "warning" },
        );
        return false;
      }

      const date = new Date(`${profile.birth_date.trim()}T00:00:00Z`);

      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== profile.birth_date.trim()
      ) {
        showDialog(
          "Invalid birth date",
          "Please enter a valid calendar date.",
          [{ text: "OK" }],
          { type: "warning" },
        );
        return false;
      }
    }

    if (profile.height_cm.trim()) {
      const height = Number(profile.height_cm);

      if (!Number.isFinite(height) || height <= 0 || height > 300) {
        showDialog(
          "Invalid height",
          "Enter a height greater than 0 and no more than 300 cm.",
          [{ text: "OK" }],
          { type: "warning" },
        );
        return false;
      }
    }

    if (profile.weight_kg.trim()) {
      const weight = Number(profile.weight_kg);

      if (!Number.isFinite(weight) || weight <= 0 || weight > 700) {
        showDialog(
          "Invalid weight",
          "Enter a weight greater than 0 and no more than 700 kg.",
          [{ text: "OK" }],
          { type: "warning" },
        );
        return false;
      }
    }

    if (
      profile.gender &&
      !genderOptions.some((option) => option.value === profile.gender)
    ) {
      showDialog(
        "Invalid gender",
        "Please select a valid option.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return false;
    }

    if (
      profile.goal &&
      !goalOptions.some((option) => option.value === profile.goal)
    ) {
      showDialog(
        "Invalid goal",
        "Please select a valid goal.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return false;
    }

    return true;
  };

  const saveProfile = async () => {
    if (savingProfile || !userId || !validateProfile()) return;

    setSavingProfile(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: profile.username.trim().toLowerCase(),
          display_name: profile.display_name.trim() || null,
          birth_date: profile.birth_date.trim() || null,
          gender: profile.gender || null,
          height_cm: profile.height_cm.trim()
            ? Number(profile.height_cm)
            : null,
          weight_kg: profile.weight_kg.trim()
            ? Number(profile.weight_kg)
            : null,
          goal: profile.goal || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      setProfile((current) => ({
        ...current,
        username: current.username.trim().toLowerCase(),
        display_name: current.display_name.trim(),
        birth_date: current.birth_date.trim(),
      }));

      Sentry.logger.info("Profile updated successfully", {
        operation: "update_profile",
      });
      posthog.capture("profile_updated");

      showDialog(
        "Profile updated",
        "Your changes have been saved.",
        [{ text: "Done" }],
        { type: "success" },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save your profile.";

      Sentry.logger.error("Profile update failed", {
        operation: "update_profile",
      });
      Sentry.captureException(error);
      posthog.capture("profile_update_failed", {
        reason:
          message.toLowerCase().includes("duplicate") ||
          message.toLowerCase().includes("unique")
            ? "username_unavailable"
            : "database_update",
      });

      if (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      ) {
        showDialog(
          "Username unavailable",
          "That username is already taken. Please choose another one.",
          [{ text: "OK" }],
          { type: "warning" },
        );
      } else {
        showDialog(
          "Could not save profile",
          message,
          [{ text: "OK" }],
          { type: "error" },
        );
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const saveCalorieGoal = async () => {
    if (savingCalories || !userId) return;

    const calories = Number(dailyCalories.trim());

    if (
      !dailyCalories.trim() ||
      !Number.isInteger(calories) ||
      calories < 500 ||
      calories > 10000
    ) {
      showDialog(
        "Invalid calorie goal",
        "Enter a whole number between 500 and 10,000 calories.",
        [{ text: "OK" }],
        { type: "warning" },
      );
      return;
    }

    if (calories === savedCalories) {
      showDialog(
        "No changes",
        "Your daily calorie goal is already set to this value.",
        [{ text: "OK" }],
        { type: "info" },
      );
      return;
    }

    setSavingCalories(true);

    try {
      // Insert a new entry so previous calorie-goal history is preserved.
      const { error } = await supabase.from("calorie_goals").insert({
        user_id: userId,
        daily_calories: calories,
        effective_at: new Date().toISOString(),
      });

      if (error) throw error;

      setSavedCalories(calories);

      Sentry.logger.info("Calorie goal updated", {
        operation: "update_calorie_goal",
      });

      posthog.capture("calorie_goal_updated", {
        source: "profile",
      });

      showDialog(
        "Calorie goal updated",
        `Your daily target is now ${calories.toLocaleString()} calories.`,
        [{ text: "Done" }],
        { type: "success" },
      );
    } catch (error) {
      Sentry.logger.error("Calorie goal update failed", {
        operation: "update_calorie_goal",
      });

      Sentry.captureException(error);

      posthog.capture("calorie_goal_update_failed", {
        failure_stage: "database_insert",
      });

      showDialog(
        "Could not update calorie goal",
        error instanceof Error
          ? error.message
          : "Something went wrong while saving your goal.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setSavingCalories(false);
    }
  };

  const performLogout = async () => {
    setLoggingOut(true);
    posthog.capture("logout_started");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      Sentry.logger.info("Logout completed", {
        operation: "logout",
      });

      posthog.capture("logout_completed");
      router.replace("/login");
    } catch (error) {
      Sentry.logger.error("Logout failed", {
        operation: "logout",
      });

      Sentry.captureException(error);
      posthog.capture("logout_failed");

      showDialog(
        "Logout failed",
        error instanceof Error
          ? error.message
          : "Unable to log out. Please try again.",
        [{ text: "OK" }],
        { type: "error" },
      );
    } finally {
      setLoggingOut(false);
    }
  };

  const logout = () => {
    if (loggingOut) return;

    showDialog(
      "Log out?",
      "Are you sure you want to log out of BiteLog?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: () => {
            void performLogout();
          },
        },
      ],
      { type: "confirmation" },
    );
  };

  const displayName =
    profile.display_name.trim() || profile.username.trim() || "Your profile";

  const avatarLetter = displayName.charAt(0).toUpperCase();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
            <Text style={styles.pageTitle}>Profile</Text>
            <Text style={styles.pageSubtitle}>
              Manage your details and daily targets.
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Text style={styles.headerIconText}>✳</Text>
          </View>
        </View>

        {/* Profile card */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>

          <View style={styles.identityInfo}>
            <Text style={styles.identityName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.identityUsername} numberOfLines={1}>
              @{profile.username || "username"}
            </Text>
            <Text style={styles.identityEmail} numberOfLines={1}>
              {email || "No email available"}
            </Text>
          </View>

          <View style={styles.activeDot} />
        </View>

        {/* Calorie goal */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Daily calorie goal</Text>
          <Text style={styles.sectionCaption}>YOUR TARGET</Text>
        </View>

        <View style={styles.calorieCard}>
          <View style={styles.calorieTopRow}>
            <View style={styles.calorieIcon}>
              <Text style={styles.calorieIconText}>⚡</Text>
            </View>

            <View style={styles.calorieInfo}>
              <Text style={styles.cardLabel}>DAILY INTAKE TARGET</Text>
              <View style={styles.calorieValueRow}>
                <Text style={styles.calorieValue}>
                  {(savedCalories ?? 0).toLocaleString()}
                </Text>
                <Text style={styles.calorieUnit}>kcal</Text>
              </View>
              <Text style={styles.calorieHint}>
                {savedCalories == null
                  ? "Set your first daily target below."
                  : "Your current daily calorie target."}
              </Text>
            </View>
          </View>

          <View style={styles.cardDivider} />

          <Text style={styles.fieldLabel}>New daily target</Text>

          <View style={styles.calorieInputRow}>
            <TextInput
              style={styles.calorieInput}
              value={dailyCalories}
              onChangeText={setDailyCalories}
              placeholder="e.g. 2200"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
              maxLength={5}
              returnKeyType="done"
              editable={!savingCalories}
              onSubmitEditing={() => void saveCalorieGoal()}
            />
            <Text style={styles.calorieInputUnit}>kcal / day</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              savingCalories && styles.buttonDisabled,
              pressed && !savingCalories && styles.buttonPressed,
            ]}
            onPress={saveCalorieGoal}
            disabled={savingCalories}
          >
            {savingCalories ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.primaryButtonText}>Update calorie goal</Text>
            )}
          </Pressable>

          <Text style={styles.helperText}>
            Previous goals are retained in your calorie-goal history.
          </Text>
        </View>

        {/* Personal details */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Personal details</Text>
          <Text style={styles.sectionCaption}>YOUR INFORMATION</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Username *</Text>
          <TextInput
            style={styles.input}
            value={profile.username}
            onChangeText={(value) => updateField("username", value)}
            placeholder="your_username"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            editable={!savingProfile}
            returnKeyType="next"
          />
          <Text style={styles.fieldHint}>
            3–24 characters. Letters, numbers, and underscores.
          </Text>

          <Text style={styles.fieldLabel}>Display name</Text>
          <TextInput
            style={styles.input}
            value={profile.display_name}
            onChangeText={(value) => updateField("display_name", value)}
            placeholder="What should we call you?"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="words"
            maxLength={60}
            editable={!savingProfile}
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Date of birth</Text>
          <TextInput
            style={styles.input}
            value={profile.birth_date}
            onChangeText={(value) => updateField("birth_date", value)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.muted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            editable={!savingProfile}
            returnKeyType="next"
          />
          <Text style={styles.fieldHint}>
            Optional. Use year-month-day format.
          </Text>

          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.optionsWrap}>
            {genderOptions.map((option) => {
              const selected = profile.gender === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() =>
                    updateField("gender", selected ? "" : option.value)
                  }
                  style={[
                    styles.optionChip,
                    selected && styles.optionChipSelected,
                  ]}
                  disabled={savingProfile}
                >
                  <Text
                    style={[
                      styles.optionText,
                      selected && styles.optionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.twoColumnRow}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Height</Text>
              <View style={styles.unitInputRow}>
                <TextInput
                  style={styles.unitInput}
                  value={profile.height_cm}
                  onChangeText={(value) => updateField("height_cm", value)}
                  placeholder="172"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  editable={!savingProfile}
                />
                <Text style={styles.unitLabel}>cm</Text>
              </View>
            </View>

            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Weight</Text>
              <View style={styles.unitInputRow}>
                <TextInput
                  style={styles.unitInput}
                  value={profile.weight_kg}
                  onChangeText={(value) => updateField("weight_kg", value)}
                  placeholder="68"
                  placeholderTextColor={COLORS.muted}
                  keyboardType="decimal-pad"
                  maxLength={6}
                  editable={!savingProfile}
                />
                <Text style={styles.unitLabel}>kg</Text>
              </View>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Fitness goal</Text>
          <View style={styles.goalOptions}>
            {goalOptions.map((option) => {
              const selected = profile.goal === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() =>
                    updateField("goal", selected ? "" : option.value)
                  }
                  style={[
                    styles.goalOption,
                    selected && styles.goalOptionSelected,
                  ]}
                  disabled={savingProfile}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      selected && styles.radioOuterSelected,
                    ]}
                  >
                    {selected && <View style={styles.radioInner} />}
                  </View>

                  <Text
                    style={[
                      styles.goalOptionText,
                      selected && styles.goalOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              styles.profileSaveButton,
              savingProfile && styles.buttonDisabled,
              pressed && !savingProfile && styles.buttonPressed,
            ]}
            onPress={saveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator color={COLORS.background} />
            ) : (
              <Text style={styles.primaryButtonText}>Save changes</Text>
            )}
          </Pressable>
        </View>

        {/* Account */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <View style={styles.accountCard}>
          <View style={styles.accountIcon}>
            <Text style={styles.accountIconText}>↗</Text>
          </View>

          <View style={styles.accountInfo}>
            <Text style={styles.accountTitle}>Sign out</Text>
            <Text style={styles.accountSubtitle}>
              Sign out of your BiteLog account on this device.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutButtonPressed,
              loggingOut && styles.buttonDisabled,
            ]}
            onPress={logout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator color={COLORS.danger} size="small" />
            ) : (
              <Text style={styles.logoutButtonText}>Log out</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footerText}>
          BITELOG · YOUR JOURNEY, YOUR PACE
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: COLORS.secondary,
    fontSize: 14,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
  },
  pageTitle: {
    color: COLORS.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  pageSubtitle: {
    color: COLORS.secondary,
    fontSize: 13,
    marginTop: 6,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#222A1C",
    borderWidth: 1,
    borderColor: "#39482A",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconText: {
    color: COLORS.accent,
    fontSize: 27,
    fontWeight: "700",
  },

  identityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 28,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: COLORS.background,
    fontSize: 25,
    fontWeight: "900",
  },
  identityInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  identityName: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "800",
  },
  identityUsername: {
    color: COLORS.accent,
    fontSize: 12,
    marginTop: 3,
  },
  identityEmail: {
    color: COLORS.secondary,
    fontSize: 11,
    marginTop: 5,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sectionCaption: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
  },

  calorieCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 28,
  },
  calorieTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  calorieIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#222A1C",
    borderWidth: 1,
    borderColor: "#39482A",
    alignItems: "center",
    justifyContent: "center",
  },
  calorieIconText: {
    fontSize: 22,
    color: COLORS.accent,
  },
  calorieInfo: {
    flex: 1,
    marginLeft: 13,
  },
  cardLabel: {
    color: COLORS.secondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  calorieValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 4,
  },
  calorieValue: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  calorieUnit: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 7,
  },
  calorieHint: {
    color: COLORS.secondary,
    fontSize: 11,
    marginTop: 3,
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 19,
  },

  fieldLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 16,
  },
  fieldHint: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 7,
    lineHeight: 15,
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
    marginTop: 12,
  },

  input: {
    height: 49,
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 13,
  },
  calorieInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  calorieInput: {
    flex: 1,
    height: 49,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  calorieInputUnit: {
    color: COLORS.secondary,
    fontSize: 11,
  },

  primaryButton: {
    minHeight: 49,
    borderRadius: 13,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 16,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: "900",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },

  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 17,
    marginBottom: 28,
  },
  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.input,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionChipSelected: {
    backgroundColor: "#222A1C",
    borderColor: COLORS.accent,
  },
  optionText: {
    color: COLORS.secondary,
    fontSize: 11,
    fontWeight: "600",
  },
  optionTextSelected: {
    color: COLORS.accent,
    fontWeight: "800",
  },

  twoColumnRow: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  unitInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  unitInput: {
    flex: 1,
    height: 48,
    color: COLORS.text,
    fontSize: 14,
  },
  unitLabel: {
    color: COLORS.secondary,
    fontSize: 11,
  },

  goalOptions: {
    gap: 9,
  },
  goalOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  goalOptionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: "#20271B",
  },
  radioOuter: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.muted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  radioOuterSelected: {
    borderColor: COLORS.accent,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  goalOptionText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: "600",
  },
  goalOptionTextSelected: {
    color: COLORS.text,
    fontWeight: "800",
  },
  profileSaveButton: {
    marginTop: 24,
  },

  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 15,
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#2A1D1D",
    alignItems: "center",
    justifyContent: "center",
  },
  accountIconText: {
    color: COLORS.danger,
    fontSize: 22,
    fontWeight: "700",
  },
  accountInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  accountTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  accountSubtitle: {
    color: COLORS.secondary,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: "#573232",
    backgroundColor: "#2A1D1D",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  logoutButtonPressed: {
    opacity: 0.7,
  },
  logoutButtonText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "800",
  },

  footerText: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
    textAlign: "center",
    marginTop: 28,
  },
});
