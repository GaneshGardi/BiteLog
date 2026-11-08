
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
import Constants from "expo-constants";
import { usePostHog } from "posthog-react-native";

import { supabase } from "../lib/supabase";
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

export default function ForgotPasswordScreen() {
  const posthog = usePostHog();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleResetRequest = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert(
        "Missing email",
        "Please enter your email address.",
      );
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      Alert.alert(
        "Invalid email",
        "Please enter a valid email address.",
      );
      return;
    }

    if (loading) return;

    setLoading(true);

    try {
      let redirectTo: string;

      if (__DEV__) {
        // Use the current Metro host when testing in Expo Go.
        const hostUri = Constants.expoConfig?.hostUri;

        if (!hostUri) {
          throw new Error(
            "Expo development server address not found.",
          );
        }

        redirectTo = `exp://${hostUri}/--/reset-password`;
      } else {
        // Use the BiteLog deep link in production builds.
        redirectTo = "bitelog://reset-password";
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        cleanEmail,
        {
          redirectTo,
        },
      );

      if (error) {
        Sentry.logger.error("Password reset request failed", {
          operation: "password_reset_request",
          reason: "auth_error",
        });

        Sentry.captureException(error);

        posthog.capture("password_reset_request_failed", {
          reason: "auth_error",
        });

        Alert.alert(
          "Request failed",
          "We couldn't send the reset email. Please try again.",
        );

        return;
      }

      Sentry.logger.info("Password reset email requested", {
        operation: "password_reset_request",
      });

      posthog.capture("password_reset_requested");

      setSubmitted(true);
    } catch (error) {
      Sentry.logger.error("Unexpected password reset error", {
        operation: "password_reset_request",
        reason: "unexpected_error",
      });

      Sentry.captureException(error);

      posthog.capture("password_reset_request_failed", {
        reason: "unexpected_error",
      });

      Alert.alert(
        "Something went wrong",
        "Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <Ionicons
            name="arrow-back"
            size={21}
            color={C.text}
          />

          <Text style={styles.backText}>
            Back to login
          </Text>
        </Pressable>

        <View style={styles.iconContainer}>
          <Ionicons
            name="lock-open-outline"
            size={32}
            color={C.accent}
          />
        </View>

        <Text style={styles.eyebrow}>
          ACCOUNT RECOVERY
        </Text>

        <Text style={styles.title}>
          Forgot your{"\n"}password?
        </Text>

        <Text style={styles.subtitle}>
          Enter the email address associated with your BiteLog
          account. We'll send you a link to reset your password.
        </Text>

        {submitted ? (
          <View style={styles.successCard}>
            <Ionicons
              name="checkmark-circle-outline"
              size={34}
              color={C.accent}
            />

            <Text style={styles.successTitle}>
              Check your inbox
            </Text>

            <Text style={styles.successText}>
              If an account exists for that email address, you'll
              receive a password reset link shortly. Check your
              spam folder too.
            </Text>

            <Pressable
              style={styles.button}
              onPress={() => router.replace("/login")}
            >
              <Text style={styles.buttonText}>
                Back to login
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>
              Email address
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={19}
                color={C.muted}
              />

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
                returnKeyType="send"
                onSubmitEditing={handleResetRequest}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
              onPress={handleResetRequest}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={C.background} />
              ) : (
                <>
                  <Text style={styles.buttonText}>
                    Send reset link
                  </Text>

                  <Ionicons
                    name="arrow-forward"
                    size={19}
                    color={C.background}
                  />
                </>
              )}
            </Pressable>
          </View>
        )}
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
    paddingTop: 65,
    paddingBottom: 40,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 55,
  },

  backText: {
    color: C.secondary,
    fontSize: 13,
    fontWeight: "600",
  },

  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#29351F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 25,
  },

  eyebrow: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 12,
  },

  title: {
    color: C.text,
    fontSize: 36,
    lineHeight: 43,
    fontWeight: "900",
    letterSpacing: -1,
  },

  subtitle: {
    color: C.secondary,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
    marginBottom: 35,
  },

  form: {
    width: "100%",
  },

  label: {
    color: C.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 9,
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
    color: C.text,
    fontSize: 14,
    paddingVertical: 0,
  },

  button: {
    height: 56,
    marginTop: 25,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.accent,
  },

  buttonPressed: {
    opacity: 0.8,
  },

  buttonDisabled: {
    opacity: 0.5,
  },

  buttonText: {
    color: C.background,
    fontSize: 15,
    fontWeight: "900",
  },

  successCard: {
    padding: 22,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
  },

  successTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 14,
  },

  successText: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
  },
});
