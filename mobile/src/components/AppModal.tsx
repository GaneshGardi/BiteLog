
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

type AppModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdropPress?: boolean;
  showCloseButton?: boolean;
  presentation?: "center" | "bottom";
  loading?: boolean;
};

const C = {
  background: "#101010",
  card: "#1A1A1A",
  text: "#FFFFFF",
  secondary: "#999999",
  muted: "#707070",
  border: "#303030",
};

export default function AppModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeOnBackdropPress = true,
  showCloseButton = true,
  presentation = "center",
  loading = false,
}: AppModalProps) {
  const isBottomSheet = presentation === "bottom";

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isBottomSheet ? "slide" : "fade"}
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "bottom"]}
      >
        <View
          style={[
            styles.overlay,
            isBottomSheet
              ? styles.bottomOverlay
              : styles.centerOverlay,
          ]}
        >
          {/* Backdrop */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={
              closeOnBackdropPress && !loading
                ? onClose
                : undefined
            }
            accessible={false}
          />

          {/* Keyboard-aware modal container */}
          <KeyboardAvoidingView
            style={[
              styles.keyboardContainer,
              isBottomSheet
                ? styles.bottomKeyboardContainer
                : styles.centerKeyboardContainer,
            ]}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <View
              style={[
                styles.modalContainer,
                isBottomSheet && styles.bottomModalContainer,
              ]}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text style={styles.title}>{title}</Text>

                  {subtitle ? (
                    <Text style={styles.subtitle}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>

                {showCloseButton && (
                  <Pressable
                    onPress={handleClose}
                    style={styles.closeButton}
                    hitSlop={10}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Close modal"
                  >
                    <Ionicons
                      name="close"
                      size={20}
                      color={C.text}
                    />
                  </Pressable>
                )}
              </View>

              {/* Scrollable content */}
              <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={
                  Platform.OS === "ios" ? "interactive" : "on-drag"
                }
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {children}
              </ScrollView>

              {/* Optional footer */}
              {footer ? (
                <View style={styles.footer}>
                  {footer}
                </View>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },

  centerOverlay: {
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  bottomOverlay: {
    justifyContent: "flex-end",
  },

  keyboardContainer: {
    width: "100%",
  },

  centerKeyboardContainer: {
    maxHeight: "90%",
    justifyContent: "center",
  },

  bottomKeyboardContainer: {
    maxHeight: "92%",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: C.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    maxHeight: "100%",
  },

  bottomModalContainer: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 16,
  },

  headerText: {
    flex: 1,
    paddingRight: 12,
  },

  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: "800",
  },

  subtitle: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#292929",
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    flexShrink: 1,
  },

  contentContainer: {
    paddingHorizontal: 22,
    paddingBottom: 20,
  },

  footer: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
});
