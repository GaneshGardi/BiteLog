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
import BiteLogMark from "../components/BiteLogoMark";

import { supabase } from "../lib/supabase";
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

export default function SignupScreen() {
  const posthog = usePostHog();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanEmail || !cleanUsername || !password || !confirmPassword) {
      Alert.alert("Missing information", "Please fill in all fields.");
      return;
    }

    if (cleanUsername.length < 3) {
      Alert.alert(
        "Invalid username",
        "Username must be at least 3 characters.",
      );
      return;
    }

    if (password.length < 6) {
      Alert.alert(
        "Invalid password",
        "Password must be at least 6 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Passwords do not match",
        "Please make sure both passwords are the same.",
      );
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            username: cleanUsername,
          },
        },
      });

      if (error) {
        Sentry.logger.error("Signup failed", {
          operation: "signup",
          method: "email",
        });

        Sentry.captureException(error);

        posthog.capture("signup_failed", {
          method: "email",
          failure_stage: "supabase_signup",
        });

        Alert.alert("Signup failed", error.message);
        return;
      }

      if (!data.user) {
        Sentry.logger.warn("Signup returned no user", {
          operation: "signup",
        });

        posthog.capture("signup_failed", {
          method: "email",
          failure_stage: "missing_user",
        });

        Alert.alert("Signup failed", "The account could not be created.");
        return;
      }

      Sentry.logger.info("Signup completed", {
        operation: "signup",
        method: "email",
      });

      posthog.capture("signup_completed", {
        method: "email",
      });

      Alert.alert("Account created", `Welcome, ${cleanUsername}!`, [
        {
          text: "Continue",
          onPress: () => router.replace("/"),
        },
      ]);
    } catch (error) {
      Sentry.logger.error("Unexpected signup error", {
        operation: "signup",
        method: "email",
      });

      Sentry.captureException(error);

      posthog.capture("signup_failed", {
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
          <Text style={styles.eyebrow}>YOUR JOURNEY STARTS HERE</Text>

          <Text style={styles.title}>Create your{"\n"}account.</Text>

          <Text style={styles.subtitle}>
            Join funTracker and take control of your daily nutrition, one meal
            at a time.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Email */}
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
            />
          </View>

          {/* Username */}
          <Text style={styles.label}>Username</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="at-outline" size={19} color={C.muted} />

            <TextInput
              style={styles.input}
              placeholder="Choose a username"
              placeholderTextColor={C.muted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.helperContainer}>
            <Ionicons name="people-outline" size={14} color={C.accent} />

            <Text style={styles.helper}>
              This is the name your friends will see.
            </Text>
          </View>

          {/* Password */}
          <Text style={styles.label}>Password</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={19} color={C.muted} />

            <TextInput
              style={styles.input}
              placeholder="Create a password"
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Pressable
              onPress={() => setPasswordVisible(!passwordVisible)}
              disabled={loading}
              hitSlop={10}
            >
              <Ionicons
                name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={C.muted}
              />
            </Pressable>
          </View>

          <Text style={styles.passwordHint}>Use at least 6 characters.</Text>

          {/* Confirm password */}
          <Text style={styles.label}>Confirm password</Text>

          <View style={styles.inputContainer}>
            <Ionicons
              name="shield-checkmark-outline"
              size={19}
              color={C.muted}
            />

            <TextInput
              style={styles.input}
              placeholder="Enter password again"
              placeholderTextColor={C.muted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!confirmPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              onSubmitEditing={handleSignup}
              returnKeyType="done"
            />

            <Pressable
              onPress={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
              disabled={loading}
              hitSlop={10}
            >
              <Ionicons
                name={
                  confirmPasswordVisible ? "eye-off-outline" : "eye-outline"
                }
                size={20}
                color={C.muted}
              />
            </Pressable>
          </View>

          {/* Create account */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.background} />
            ) : (
              <>
                <Text style={styles.buttonText}>Create account</Text>

                <Ionicons name="arrow-forward" size={19} color={C.background} />
              </>
            )}
          </Pressable>

          {/* Login */}
          <Pressable
            style={styles.loginContainer}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text style={styles.loginText}>Already have an account? </Text>

            <Text style={styles.loginLink}>Log in</Text>
          </Pressable>

          {/* Footer */}
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
    marginBottom: 38,
  },

  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#000000",
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
  },

  // Helper text
  helperContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 8,
  },

  helper: {
    fontSize: 11,
    color: C.secondary,
  },

  passwordHint: {
    marginTop: 7,
    fontSize: 10,
    color: C.muted,
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

  // Login link
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },

  loginText: {
    color: C.secondary,
    fontSize: 12,
  },

  loginLink: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "800",
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
