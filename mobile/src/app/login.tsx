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
import BiteLogMark from "../components/BiteLogoMark";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../lib/sentry";

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

export default function LoginScreen() {
  const posthog = usePostHog();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      Alert.alert(
        "Missing information",
        "Please enter your email and password.",
      );
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        Sentry.logger.warn("Login failed", {
          operation: "login",
          method: "email",
        });

        posthog.capture("login_failed", {
          method: "email",
          failure_stage: "authentication",
        });

        Alert.alert("Login failed", error.message);
        return;
      }

      if (!data.session) {
        Sentry.logger.warn("Login returned no session", {
          operation: "login",
        });

        posthog.capture("login_failed", {
          method: "email",
          failure_stage: "missing_session",
        });

        Alert.alert(
          "Login failed",
          "Login succeeded but no session was created.",
        );
        return;
      }

      Sentry.logger.info("Login completed", {
        operation: "login",
        method: "email",
      });

      posthog.capture("login_completed", {
        method: "email",
      });

      const { data: existingGoal, error: goalError } = await supabase
        .from("calorie_goals")
        .select("daily_calories")
        .eq("user_id", data.user.id)
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (goalError) {
        Sentry.logger.error("Failed to load calorie goal after login", {
          operation: "login",
          stage: "goal_lookup",
        });

        Sentry.captureException(goalError);

        posthog.capture("login_goal_lookup_failed");

        Alert.alert(
          "Could not load calorie goal",
          "Please try logging in again.",
        );
        return;
      }

      if (existingGoal) {
        router.replace("/");
      } else {
        router.replace("/calorie-goal");
      }
    } catch (error) {
      Sentry.logger.error("Unexpected login error", {
        operation: "login",
      });

      Sentry.captureException(error);

      posthog.capture("login_failed", {
        method: "email",
        failure_stage: "unexpected_error",
      });

      Alert.alert("Something went wrong", "Please try again.");
    } finally {
      setLoading(false);
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
            <BiteLogMark width={52} height={52} />
          </View>

          <Text style={styles.brandName}>
            Bite<Text style={styles.brandAccent}>Log</Text>
          </Text>
        </View>

        {/* Heading */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>WELCOME BACK</Text>

          <Text style={styles.title}>Good to see{"\n"}you again.</Text>

          <Text style={styles.subtitle}>
            Log in to continue tracking your progress.
          </Text>
        </View>

        {/* Login form */}
        <View style={styles.form}>
          <Text style={styles.label}>Email address</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={19} color={C.muted} />

            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={C.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!loading}
              returnKeyType="next"
            />
          </View>

          <Text style={styles.label}>Password</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={19} color={C.muted} />

            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />

            <Pressable
              onPress={() => setPasswordVisible((visible) => !visible)}
              disabled={loading}
              hitSlop={10}
            >
              <Ionicons
                name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                size={19}
                color={C.muted}
              />
            </Pressable>
          </View>

          {/* Login button */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.background} />
            ) : (
              <>
                <Text style={styles.buttonText}>Log in</Text>

                <Ionicons name="arrow-forward" size={19} color={C.background} />
              </>
            )}
          </Pressable>

          {/* Signup */}
          <View style={styles.signupContainer}>
            <Text style={styles.signupPrompt}>Don't have an account?</Text>

            <Pressable
              onPress={() => router.push("/signup")}
              disabled={loading}
              hitSlop={8}
            >
              <Text style={styles.signupLink}>Create one</Text>
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons name="shield-checkmark-outline" size={14} color={C.muted} />

          <Text style={styles.footerText}>
            Your progress. Your journey. Your data.
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
    paddingTop: 55,
    paddingBottom: 30,
  },

  // Brand
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 58,
  },

  brandIcon: {
    width: 35,
    height: 35,
    borderRadius: 14,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },

  brandName: {
    color: C.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.8,
  },

  brandAccent: {
    color: C.accent,
  },

  // Heading
  header: {
    marginBottom: 34,
  },

  eyebrow: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 12,
  },

  title: {
    fontSize: 36,
    lineHeight: 43,
    fontWeight: "900",
    letterSpacing: -1.2,
    color: C.text,
  },

  subtitle: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 22,
    color: C.secondary,
  },

  // Form
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
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.input,
  },

  input: {
    flex: 1,
    height: 54,
    fontSize: 14,
    color: C.text,
    paddingVertical: 0,
  },

  // Button
  button: {
    height: 56,
    marginTop: 31,
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

  // Signup
  signupContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 27,
  },

  signupPrompt: {
    color: C.secondary,
    fontSize: 13,
  },

  signupLink: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "800",
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 55,
  },

  footerText: {
    color: C.muted,
    fontSize: 10,
  },
});
