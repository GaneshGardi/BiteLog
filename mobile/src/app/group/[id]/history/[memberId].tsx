
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import GroupWeeklyHistory from "../../../../components/GroupWeeklyHistory";

export default function GroupMemberHistoryScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    id: string | string[];
    memberId: string | string[];
  }>();

  const groupId = Array.isArray(params.id)
    ? params.id[0]
    : params.id;

  const memberId = Array.isArray(params.memberId)
    ? params.memberId[0]
    : params.memberId;

  if (!groupId || !memberId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons
            name="alert-circle-outline"
            size={42}
            color="#B6F36B"
          />

          <Text style={styles.errorTitle}>
            Unable to load history
          </Text>

          <Text style={styles.errorText}>
            We couldn't find the selected member or group.
          </Text>

          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>
              Go back
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Stack.Screen
        options={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#101010",
          },
        }}
      />

      <View style={styles.header}>
        <Pressable
          style={styles.backIcon}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color="#FFFFFF"
          />
        </Pressable>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>
            Weekly history
          </Text>

          <Text style={styles.headerSubtitle}>
            Calorie tracking overview
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <GroupWeeklyHistory
          groupId={groupId}
          memberId={memberId}
          refreshToken={0}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101010",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 14,
  },

  backIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
  },

  headerTextContainer: {
    flex: 1,
  },

  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  headerSubtitle: {
    color: "#888888",
    fontSize: 12,
    marginTop: 3,
  },

  content: {
    flex: 1,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },

  errorTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 16,
  },

  errorText: {
    color: "#888888",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },

  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#B6F36B",
    borderRadius: 12,
  },

  backButtonText: {
    color: "#101010",
    fontWeight: "700",
    fontSize: 13,
  },
});
