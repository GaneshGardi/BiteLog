import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../../lib/sentry";

type GroupInfo = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

type Member = {
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
};

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
};

type SearchUser = {
  user_id: string;
  username: string;
  display_name: string | null;
};

type DailyProgress = {
  user_id: string;
  username: string;
  display_name: string | null;
  calories_consumed: number | string;
  daily_calorie_goal: number | string | null;
};

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const posthog = usePostHog();

  const groupId = Array.isArray(id) ? id[0] : id;

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progressError, setProgressError] = useState("");

  const [inviteVisible, setInviteVisible] = useState(false);
  const [username, setUsername] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchError, setSearchError] = useState("");

  const loadGroup = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("id, name, created_by, created_at")
        .eq("id", groupId)
        .single();

      if (groupError) throw groupError;

      setGroup(groupData);

      const { data: memberData, error: memberError } = await supabase
        .from("group_members")
        .select("user_id, role, joined_at")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true });

      if (memberError) throw memberError;

      const memberList = (memberData ?? []) as Member[];
      setMembers(memberList);

      // Use the device's local calendar date, not UTC.
      const now = new Date();

      const localDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      try {
        const { data: progressData, error: progressFetchError } =
          await supabase.rpc("get_group_daily_progress", {
            p_group_id: groupId,
            p_log_date: localDate,
          });

        if (progressFetchError) throw progressFetchError;

        setDailyProgress((progressData ?? []) as DailyProgress[]);
        setProgressError("");
      } catch (error) {
        console.error("Error loading group calorie progress:", error);
        setDailyProgress([]);
        setProgressError(
          "Could not load calorie progress. Pull down to retry.",
        );
      }

      const userIds = [...new Set(memberList.map((member) => member.user_id))];

      if (userIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", userIds);

        if (profileError) throw profileError;

        const profileMap: Record<string, Profile> = {};

        (profileData ?? []).forEach((profile) => {
          profileMap[profile.id] = profile as Profile;
        });

        setProfiles(profileMap);
      } else {
        setProfiles({});
      }
    } catch (error) {
      console.error("Error loading group details:", error);

      Alert.alert(
        "Unable to load group",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      posthog.capture("group_viewed");
      setLoading(true);
      void loadGroup();
    }, [loadGroup, posthog]),
  );

  const refresh = () => {
    setRefreshing(true);
    void loadGroup();
  };

  // Search while typing, with a short delay to avoid querying
  // on every keystroke.
  useEffect(() => {
    const searchTerm = username.trim();

    setSearchError("");
    setSearchResults([]);

    if (searchTerm.length < 2 || !inviteVisible) {
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timeout = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("search_users_for_invites", {
          p_search: searchTerm,
        });

        if (error) throw error;

        if (!cancelled) {
          setSearchResults((data ?? []) as SearchUser[]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Username search failed:", error);
          setSearchError(
            "Search is temporarily unavailable. You can still enter a username directly.",
          );
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [username, inviteVisible]);

  const closeInviteModal = () => {
    if (sending) return;

    setInviteVisible(false);
    setUsername("");
    setSearchResults([]);
    setSearchError("");
  };

  const sendInvitation = async () => {
    const targetUsername = username.trim().replace(/^@/, "");

    if (!targetUsername) {
      Alert.alert(
        "Username required",
        "Enter the username of the person you want to invite.",
      );
      return;
    }

    if (!groupId) {
      Alert.alert("Group unavailable", "Reopen the group and try again.");
      return;
    }

    setSending(true);

    try {
      const { error } = await supabase.rpc("send_group_invitation", {
        p_group_id: groupId,
        p_username: targetUsername,
      });

      if (error) throw error;

      Sentry.logger.info("Group invitation sent", {
        operation: "send_group_invitation",
      });

      posthog.capture("group_invitation_sent");

      setInviteVisible(false);
      setUsername("");
      setSearchResults([]);
      setSearchError("");

      Alert.alert(
        "Invitation sent!",
        `Your invitation to @${targetUsername} has been sent.`,
      );
    } catch (error) {
      Sentry.logger.error("Group invitation failed", {
        operation: "send_group_invitation",
      });

      Sentry.captureException(error);

      posthog.capture("group_invitation_failed", {
        failure_stage: "send_invitation",
      });

      console.error("Error sending invitation:", error);

      const message =
        error instanceof Error ? error.message : "Please try again.";

      Alert.alert("Could not send invitation", message);
    } finally {
      setSending(false);
    }
  };

  const openMemberHistory = (memberId: string) => {
    if (!groupId || !memberId) return;

    router.push({
      pathname: "/group/[id]/history/[memberId]",
      params: {
        id: groupId,
        memberId,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: group?.name ?? "Group details",
          headerStyle: { backgroundColor: "#101010" },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: "#101010" },
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#B6F36B" />
          <Text style={styles.muted}>Loading group...</Text>
        </View>
      ) : !group ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="people-outline" size={30} color="#B6F36B" />
          </View>

          <Text style={styles.heading}>Group not found</Text>

          <Text style={styles.muted}>
            You may not have access to this group.
          </Text>

          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor="#B6F36B"
              colors={["#B6F36B"]}
              progressBackgroundColor="#1A1A1A"
            />
          }
        >
          {/* Group overview */}
          <View style={styles.hero}>
            <View style={styles.groupIcon}>
              <Ionicons name="people" size={32} color="#B6F36B" />
            </View>

            <Text style={styles.groupName}>{group.name}</Text>

            <View style={styles.memberCountBadge}>
              <Ionicons name="people-outline" size={14} color="#B6F36B" />
              <Text style={styles.memberCountText}>
                {members.length} {members.length === 1 ? "member" : "members"}
              </Text>
            </View>

            <Text style={styles.heroDescription}>
              Track your progress together.
            </Text>
          </View>

          {/* Members heading */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Group members</Text>
              <Text style={styles.sectionSubtitle}>
                Today's calorie progress
              </Text>
            </View>

            <View style={styles.countBadge}>
              <Text style={styles.countText}>{members.length}</Text>
            </View>
          </View>

          {!!progressError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color="#FF8A8A" />
              <Text style={styles.errorBannerText}>{progressError}</Text>
            </View>
          )}

          {/* Member cards */}
          {members.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="person-add-outline" size={30} color="#777777" />
              <Text style={styles.emptyTitle}>No members yet</Text>
              <Text style={styles.emptyDescription}>
                Invite friends to start tracking progress together.
              </Text>
            </View>
          ) : (
            members.map((member) => {
              const profile = profiles[member.user_id];

              const progress = dailyProgress.find(
                (item) => item.user_id === member.user_id,
              );

              const memberUsername =
                progress?.username || profile?.username || "";

              const displayName =
                progress?.display_name?.trim() ||
                profile?.display_name?.trim() ||
                memberUsername ||
                "Member";

              const consumed = Number(progress?.calories_consumed) || 0;

              const goal =
                progress?.daily_calorie_goal == null
                  ? null
                  : Number(progress.daily_calorie_goal);

              const percentage =
                goal !== null && goal > 0
                  ? Math.round((consumed / goal) * 100)
                  : null;

              const progressWidth = `${Math.min(
                Math.max(percentage ?? 0, 0),
                100,
              )}%` as `${number}%`;

              return (
                <Pressable
                  key={member.user_id}
                  style={({ pressed }) => [
                    styles.memberCard,
                    pressed && styles.memberCardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`View weekly history for ${displayName}`}
                  onPress={() => openMemberHistory(member.user_id)}
                >
                  <View style={styles.memberTopRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{displayName}</Text>

                      <Text style={styles.usernameLabel}>
                        {memberUsername
                          ? `@${memberUsername}`
                          : "Username unavailable"}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.roleBadge,
                        member.role === "owner" && styles.ownerBadge,
                      ]}
                    >
                      <Ionicons
                        name={
                          member.role === "owner"
                            ? "shield-checkmark"
                            : "person-outline"
                        }
                        size={11}
                        color={member.role === "owner" ? "#B6F36B" : "#999999"}
                      />
                      <Text
                        style={[
                          styles.roleText,
                          member.role === "owner" && styles.ownerText,
                        ]}
                      >
                        {member.role === "owner" ? "Owner" : "Member"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.memberProgress}>
                    <View style={styles.calorieNumbers}>
                      <View>
                        <Text style={styles.caloriesConsumed}>
                          {Math.round(consumed).toLocaleString()}
                          <Text style={styles.kcalLabel}> kcal</Text>
                        </Text>

                        <Text style={styles.calorieGoal}>
                          {goal !== null && goal > 0
                            ? `of ${Math.round(goal).toLocaleString()} kcal goal`
                            : "Daily goal not set"}
                        </Text>
                      </View>

                      {percentage !== null && (
                        <View style={styles.percentageBadge}>
                          <Text style={styles.progressPercentage}>
                            {percentage}%
                          </Text>
                        </View>
                      )}
                    </View>

                    {goal !== null && goal > 0 && (
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: progressWidth },
                          ]}
                        />
                      </View>
                    )}

                    {percentage !== null && percentage >= 100 && (
                      <View style={styles.goalReachedRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color="#B6F36B"
                        />
                        <Text style={styles.goalReached}>
                          Daily goal reached
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.historyHintRow}>
                    <Text style={styles.historyHint}>View weekly history</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#B6F36B"
                    />
                  </View>
                </Pressable>
              );
            })
          )}

          {/* Invite friends */}
          <Pressable
            style={({ pressed }) => [
              styles.inviteButton,
              pressed && styles.inviteButtonPressed,
            ]}
            onPress={() => setInviteVisible(true)}
          >
            <Ionicons name="person-add-outline" size={19} color="#101010" />
            <Text style={styles.inviteButtonText}>Invite friends</Text>
          </Pressable>

          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed-outline" size={15} color="#777777" />
            <Text style={styles.footer}>
              Only daily calorie progress is shared. Individual food logs remain
              private.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Invite modal */}
      <Modal
        visible={inviteVisible}
        transparent
        animationType="slide"
        onRequestClose={closeInviteModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeInviteModal} />

          <SafeAreaView style={styles.modalSafeArea} edges={["bottom"]}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <View style={styles.modalIcon}>
                  <Ionicons name="person-add" size={23} color="#B6F36B" />
                </View>

                <Pressable
                  style={styles.closeButton}
                  onPress={closeInviteModal}
                  disabled={sending}
                >
                  <Ionicons name="close" size={21} color="#AAAAAA" />
                </Pressable>
              </View>

              <Text style={styles.modalTitle}>Invite a friend</Text>

              <Text style={styles.modalDescription}>
                Find people by username or display name and invite them to your
                group.
              </Text>

              <Text style={styles.inputLabel}>USERNAME</Text>

              <View style={styles.inputContainer}>
                <Ionicons name="search-outline" size={19} color="#777777" />

                <TextInput
                  style={styles.input}
                  placeholder="Search username..."
                  placeholderTextColor="#777777"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={() => void sendInvitation()}
                  editable={!sending}
                  autoFocus
                />

                {searching && (
                  <ActivityIndicator size="small" color="#B6F36B" />
                )}
              </View>

              {!!searchError && (
                <Text style={styles.errorText}>{searchError}</Text>
              )}

              {username.trim().length >= 2 &&
                !searching &&
                !searchError &&
                searchResults.length === 0 && (
                  <Text style={styles.searchStatusText}>
                    No matches. You can still invite by exact username.
                  </Text>
                )}

              {searchResults.length > 0 && (
                <View style={styles.resultsContainer}>
                  <Text style={styles.resultsTitle}>MATCHING USERS</Text>

                  {searchResults.map((user) => {
                    const displayName =
                      user.display_name?.trim() || user.username;

                    return (
                      <Pressable
                        key={user.user_id}
                        style={styles.resultRow}
                        onPress={() => setUsername(user.username)}
                        disabled={sending}
                      >
                        <View style={styles.resultAvatar}>
                          <Text style={styles.resultAvatarText}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.resultInfo}>
                          <Text style={styles.resultName}>{displayName}</Text>
                          <Text style={styles.usernameLabel}>
                            @{user.username}
                          </Text>
                        </View>

                        <Text style={styles.selectLabel}>Select</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Pressable
                style={[styles.sendButton, sending && styles.disabledButton]}
                onPress={() => void sendInvitation()}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#101010" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={17} color="#101010" />
                    <Text style={styles.sendButtonText}>Send invitation</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.cancelButton}
                onPress={closeInviteModal}
                disabled={sending}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#101010",
  },

  content: {
    padding: 20,
    paddingBottom: 36,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#101010",
  },

  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  hero: {
    alignItems: "center",
    backgroundColor: "#1A1A1A",
    padding: 25,
    borderRadius: 22,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#303030",
  },

  groupIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#46543A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  groupName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
  },

  memberCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#252D20",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 12,
  },

  memberCountText: {
    color: "#B6F36B",
    fontSize: 12,
    fontWeight: "700",
  },

  heroDescription: {
    color: "#888888",
    fontSize: 13,
    marginTop: 13,
  },

  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  muted: {
    color: "#888888",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  sectionSubtitle: {
    fontSize: 12,
    color: "#888888",
    marginTop: 4,
  },

  countBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: "#252D20",
    alignItems: "center",
    justifyContent: "center",
  },

  countText: {
    color: "#B6F36B",
    fontSize: 13,
    fontWeight: "800",
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#2A1B1B",
    borderWidth: 1,
    borderColor: "#553030",
    padding: 13,
    borderRadius: 12,
    marginBottom: 14,
  },

  errorBannerText: {
    color: "#FFAAAA",
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },

  memberCard: {
    backgroundColor: "#1A1A1A",
    borderRadius: 18,
    padding: 16,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: "#303030",
  },

  memberCardPressed: {
    opacity: 0.75,
    borderColor: "#718C4D",
  },

  memberTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#46543A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  avatarText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#B6F36B",
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  usernameLabel: {
    fontSize: 12,
    color: "#888888",
    marginTop: 4,
  },

  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#252525",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
  },

  ownerBadge: {
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#46543A",
  },

  roleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999999",
  },

  ownerText: {
    color: "#B6F36B",
  },

  memberProgress: {
    marginTop: 19,
  },

  calorieNumbers: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  caloriesConsumed: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.6,
  },

  kcalLabel: {
    color: "#888888",
    fontSize: 12,
    fontWeight: "500",
  },

  calorieGoal: {
    color: "#888888",
    fontSize: 12,
    marginTop: 4,
  },

  percentageBadge: {
    backgroundColor: "#252D20",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  progressPercentage: {
    color: "#B6F36B",
    fontSize: 13,
    fontWeight: "800",
  },

  progressTrack: {
    height: 8,
    backgroundColor: "#303030",
    borderRadius: 8,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#B6F36B",
    borderRadius: 8,
  },

  goalReachedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },

  goalReached: {
    color: "#B6F36B",
    fontSize: 12,
    fontWeight: "700",
  },

  emptyCard: {
    padding: 26,
    borderRadius: 18,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#303030",
    alignItems: "center",
  },

  emptyTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 14,
  },

  emptyDescription: {
    color: "#888888",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 7,
  },

  historyHintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#303030",
  },

  historyHint: {
    color: "#B6F36B",
    fontSize: 12,
    fontWeight: "700",
  },

  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#B6F36B",
    padding: 16,
    borderRadius: 14,
    marginTop: 13,
  },

  inviteButtonPressed: {
    opacity: 0.8,
  },

  inviteButtonText: {
    color: "#101010",
    fontSize: 15,
    fontWeight: "800",
  },

  privacyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 10,
  },

  footer: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 17,
    color: "#777777",
  },

  primaryButton: {
    backgroundColor: "#B6F36B",
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 22,
  },

  primaryButtonText: {
    color: "#101010",
    fontWeight: "800",
    fontSize: 14,
  },

  // Invite modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },

  modalSafeArea: {
    backgroundColor: "#1A1A1A",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
  },

  modalContent: {
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 12,
    maxHeight: "90%",
  },

  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#484848",
    alignSelf: "center",
    marginBottom: 20,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "#252D20",
    borderWidth: 1,
    borderColor: "#46543A",
    alignItems: "center",
    justifyContent: "center",
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#252525",
    alignItems: "center",
    justifyContent: "center",
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "800",
    marginTop: 18,
  },

  modalDescription: {
    color: "#999999",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    marginBottom: 23,
  },

  inputLabel: {
    color: "#AAAAAA",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 9,
  },

  inputContainer: {
    height: 53,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#383838",
    borderRadius: 13,
    backgroundColor: "#101010",
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: "#FFFFFF",
  },

  searchStatusText: {
    color: "#999999",
    fontSize: 12,
    marginTop: 12,
    lineHeight: 18,
  },

  errorText: {
    color: "#FF8A8A",
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18,
  },

  resultsContainer: {
    marginTop: 19,
  },

  resultsTitle: {
    color: "#999999",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#383838",
  },

  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#252D20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  resultAvatarText: {
    color: "#B6F36B",
    fontWeight: "800",
    fontSize: 15,
  },

  resultInfo: {
    flex: 1,
  },

  resultName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  selectLabel: {
    color: "#B6F36B",
    fontSize: 12,
    fontWeight: "700",
  },

  sendButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#B6F36B",
    padding: 15,
    borderRadius: 13,
    marginTop: 22,
  },

  sendButtonText: {
    color: "#101010",
    fontSize: 14,
    fontWeight: "800",
  },

  disabledButton: {
    opacity: 0.6,
  },

  cancelButton: {
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 5,
  },

  cancelButtonText: {
    color: "#999999",
    fontSize: 13,
    fontWeight: "700",
  },
});
