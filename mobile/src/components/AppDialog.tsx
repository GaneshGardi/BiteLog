
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type AppDialogType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "confirmation";

export type AppDialogButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

type AppDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  type: AppDialogType;
  buttons: AppDialogButton[];
  cancelable: boolean;
  onDismiss: () => void;
  onButtonPress: (button: AppDialogButton) => void;
};

const C = {
  background: "#101010",
  card: "#1A1A1A",
  input: "#141414",
  accent: "#B6F36B",
  text: "#FFFFFF",
  secondary: "#999999",
  border: "#303030",
  danger: "#FF7777",
  warning: "#F5C76B",
};

const appearance = {
  success: {
    icon: "checkmark-circle",
    color: C.accent,
    background: "#29351F",
  },
  error: {
    icon: "alert-circle",
    color: C.danger,
    background: "#351F1F",
  },
  warning: {
    icon: "warning",
    color: C.warning,
    background: "#352D1F",
  },
  info: {
    icon: "information-circle",
    color: C.accent,
    background: "#29351F",
  },
  confirmation: {
    icon: "help-circle",
    color: C.accent,
    background: "#29351F",
  },
} as const;

export default function AppDialog({
  visible,
  title,
  message,
  type,
  buttons,
  cancelable,
  onDismiss,
  onButtonPress,
}: AppDialogProps) {
  const config = appearance[type];

  const horizontalButtons = buttons.length === 2;

  const getButtonType = (
    button: AppDialogButton,
    index: number,
  ) => {
    if (button.style === "destructive") {
      return "destructive";
    }

    if (button.style === "cancel") {
      return "secondary";
    }

    if (horizontalButtons && index === 0) {
      return "secondary";
    }

    return "primary";
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (cancelable) onDismiss();
      }}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={cancelable ? onDismiss : undefined}
          accessible={false}
        />

        <View
          style={styles.dialog}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          {/* Icon */}
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: config.background },
            ]}
          >
            <Ionicons
              name={config.icon}
              size={31}
              color={config.color}
            />
          </View>

          {/* Message */}
          <Text style={styles.title}>{title}</Text>

          {!!message && (
            <Text style={styles.message}>{message}</Text>
          )}

          {/* Actions */}
          <View
            style={[
              styles.actions,
              horizontalButtons && styles.horizontalActions,
            ]}
          >
            {buttons.map((button, index) => {
              const buttonType = getButtonType(button, index);

              return (
                <Pressable
                  key={`${button.text ?? "button"}-${index}`}
                  style={({ pressed }) => [
                    styles.button,
                    buttonType === "primary" && styles.primaryButton,
                    buttonType === "secondary" && styles.secondaryButton,
                    buttonType === "destructive" &&
                      styles.destructiveButton,
                    horizontalButtons && styles.horizontalButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => onButtonPress(button)}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.buttonText,
                      buttonType === "primary" &&
                        styles.primaryButtonText,
                      buttonType === "secondary" &&
                        styles.secondaryButtonText,
                      buttonType === "destructive" &&
                        styles.destructiveButtonText,
                    ]}
                  >
                    {button.text ?? "OK"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.76)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },

  dialog: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: "center",
  },

  iconContainer: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  title: {
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },

  message: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 10,
  },

  actions: {
    width: "100%",
    gap: 10,
    marginTop: 25,
  },

  horizontalActions: {
    flexDirection: "row",
  },

  button: {
    minHeight: 49,
    borderRadius: 13,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  horizontalButton: {
    flex: 1,
  },

  primaryButton: {
    backgroundColor: C.accent,
  },

  secondaryButton: {
    backgroundColor: C.input,
    borderWidth: 1,
    borderColor: C.border,
  },

  destructiveButton: {
    backgroundColor: "#351F1F",
    borderWidth: 1,
    borderColor: "#633030",
  },

  buttonText: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },

  primaryButtonText: {
    color: C.background,
  },

  secondaryButtonText: {
    color: C.text,
  },

  destructiveButtonText: {
    color: C.danger,
  },

  buttonPressed: {
    opacity: 0.75,
  },
});
