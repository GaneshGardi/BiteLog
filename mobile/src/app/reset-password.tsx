
import { useEffect, useRef, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
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

type RecoveryStatus = "loading" | "ready" | "error";

type RecoveryAttempt = {
  code: string;
  promise: Promise<void>;
};

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const posthog = usePostHog();

  const code = Array.isArray(params.code) ? params.code[0] : params.code;

  // Reuse the same exchange promise if React Strict Mode remounts the effect.
  const recoveryAttemptRef = useRef<RecoveryAttempt | null>(null);
  const missingCodeLoggedRef = useRef(false);

  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryStatus>("loading");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Validate the recovery code and establish the Supabase session.
  useEffect(() => {
    let active = true;

    if (!code) {
      setRecoveryStatus("error");

      if (!missingCodeLoggedRef.current) {
        missingCodeLoggedRef.current = true;

        Sentry.logger.error(
          "Password recovery link is missing its verification code",
          {
            operation: "password_recovery",
            reason: "missing_code",
          },
        );

        posthog.capture("password_reset_link_failed", {
          reason: "missing_code",
        });
      }

      return () => {
        active = false;
      };
    }

    let recoveryPromise: Promise<void>;

    const existingAttempt = recoveryAttemptRef.current;

    if (existingAttempt?.code === code) {
      recoveryPromise = existingAttempt.promise;
    } else {
      recoveryPromise = (async () => {
        const { error } =
          await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          throw error;
        }

        Sentry.logger.info("Password recovery link verified", {
          operation: "password_recovery",
        });

        posthog.capture("password_reset_link_verified");
      })().catch((error: unknown) => {
        Sentry.logger.error(
          "Password recovery link validation failed",
          {
            operation: "password_recovery",
            reason: "exchange_failed",
          },
        );

        Sentry.captureException(error);

        posthog.capture("password_reset_link_failed", {
          reason: "exchange_failed",
        });

        throw error;
      });

      recoveryAttemptRef.current = {
        code,
        promise: recoveryPromise,
      };
    }

    recoveryPromise
      .then(() => {
        if (active) {
          setRecoveryStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setRecoveryStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [code, posthog]);

  const handleContinue = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } catch (error) {
      Sentry.logger.error("Sign out after password reset failed", {
        operation: "password_reset_signout",
      });

      Sentry.captureException(error);

      posthog.capture("password_reset_signout_failed");
    } finally {
      router.replace("/login");
    }
  };

  const handleUpdatePassword = async () => {
    if (password.length < 8) {
      Alert.alert(
        "Password too short",
        "Your new password must contain at least 8 characters.",
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Passwords don't match",
        "Please enter the same password in both fields.",
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        const normalizedMessage = error.message.toLowerCase();

        const isSamePassword =
          error.code === "same_password" ||
          normalizedMessage.includes("same password") ||
          normalizedMessage.includes("same as the current password") ||
          normalizedMessage.includes("different from the old password") ||
          normalizedMessage.includes("different from the current password");

        if (isSamePassword) {
          Sentry.logger.info(
            "Password reset rejected because the password was reused",
            {
              operation: "password_update",
              reason: "same_password",
            },
          );

          posthog.capture("password_reset_same_password_attempted");

          setPassword("");
          setConfirmPassword("");

          Alert.alert(
            "Choose a different password",
            "This is already your current password. Please enter a new password that you haven't used before.",
          );

          return;
        }

        Sentry.logger.error("Password update failed", {
          operation: "password_update",
          reason: "auth_error",
        });

        Sentry.captureException(error);

        posthog.capture("password_reset_failed", {
          reason: "auth_error",
        });

        Alert.alert(
          "Update failed",
          "We couldn't update your password. Please try again.",
        );

        return;
      }

      Sentry.logger.info("Password updated successfully", {
        operation: "password_update",
      });

      posthog.capture("password_reset_completed");

      setPassword("");
      setConfirmPassword("");

      Alert.alert(
        "Password updated",
        "Your password has been changed successfully. Please log in with your new password.",
        [
          {
            text: "Continue",
            onPress: handleContinue,
          },
        ],
        { cancelable: false },
      );
    } catch (error) {
      Sentry.logger.error("Unexpected password update error", {
        operation: "password_update",
        reason: "unexpected_error",
      });

      Sentry.captureException(error);

      posthog.capture("password_reset_failed", {
        reason: "unexpected_error",
      });

      Alert.alert(
        "Something went wrong",
        "We couldn't update your password. Please try again.",
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
          onPress={() => router.replace("/login")}
          hitSlop={10}
        >
          <Ionicons name="arrow-back" size={21} color={C.text} />

          <Text style={styles.backText}>Back to login</Text>
        </Pressable>

        <View style={styles.iconContainer}>
          <Ionicons
            name="lock-closed-outline"
            size={32}
            color={C.accent}
          />
        </View>

        <Text style={styles.eyebrow}>ACCOUNT SECURITY</Text>

        <Text style={styles.title}>
          Create a new{"\n"}password.
        </Text>

        {recoveryStatus === "loading" ? (
          <View style={styles.messageCard}>
            <ActivityIndicator size="large" color={C.accent} />

            <Text style={styles.messageText}>
              Verifying your password reset link…
            </Text>
          </View>
        ) : recoveryStatus === "error" ? (
          <View style={styles.messageCard}>
            <Ionicons
              name="alert-circle-outline"
              size={36}
              color="#FF8585"
            />

            <Text style={styles.messageTitle}>
              Link invalid or expired
            </Text>

            <Text style={styles.messageText}>
              This password reset link may have expired or already been used.
              Please request a new one.
            </Text>

            <Pressable
              style={styles.button}
              onPress={() => router.replace("/forgot-password")}
            >
              <Text style={styles.buttonText}>
                Request another link
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Choose a strong password with at least 8 characters.
            </Text>

            <View style={styles.form}>
              <Text style={styles.label}>New password</Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={C.muted}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Enter new password"
                  placeholderTextColor={C.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="next"
                />

                <Pressable
                  onPress={() =>
                    setPasswordVisible((visible) => !visible)
                  }
                  hitSlop={10}
                >
                  <Ionicons
                    name={
                      passwordVisible
                        ? "eye-off-outline"
                        : "eye-outline"
                    }
                    size={19}
                    color={C.muted}
                  />
                </Pressable>
              </View>

              <Text style={styles.label}>
                Confirm new password
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={C.muted}
                />

                <TextInput
                  style={styles.input}
                  placeholder="Re-enter new password"
                  placeholderTextColor={C.muted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={handleUpdatePassword}
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleUpdatePassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={C.background} />
                ) : (
                  <>
                    <Text style={styles.buttonText}>
                      Update password
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
          </>
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
    marginBottom: 30,
  },

  form: {
    width: "100%",
  },

  label: {
    color: C.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 9,
    marginTop: 19,
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
    marginTop: 28,
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

  messageCard: {
    alignItems: "center",
    padding: 22,
    marginTop: 30,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },

  messageTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
  },

  messageText: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 12,
  },
});
