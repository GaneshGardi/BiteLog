import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { usePostHog } from "posthog-react-native";
import { Sentry } from "../../lib/sentry";

type Group = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

type Invitation = {
  invitation_id: string;
  group_id: string;
  group_name: string;
  inviter_user_id: string;
  inviter_username: string;
  inviter_display_name: string | null;
  invitation_created_at: string;
};

const C = {
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

export default function FriendsScreen() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const router = useRouter();
  const posthog = usePostHog();

  const loadData = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!user) {
          setGroups([]);
          setInvitations([]);
          router.replace("/login");
          return;
        }

        const [membershipResult, invitationResult] = await Promise.all([
          supabase
            .from("group_members")
            .select("group_id")
            .eq("user_id", user.id),
          supabase.rpc("get_pending_group_invitations"),
        ]);

        if (membershipResult.error) throw membershipResult.error;
        if (invitationResult.error) throw invitationResult.error;

        const groupIds = (membershipResult.data ?? []).map(
          (membership) => membership.group_id,
        );

        const groupsResult =
          groupIds.length > 0
            ? await supabase
                .from("groups")
                .select("id, name, created_by, created_at")
                .in("id", groupIds)
                .order("created_at", { ascending: false })
            : { data: [], error: null };

        if (groupsResult.error) throw groupsResult.error;

        setGroups(groupsResult.data ?? []);
        setInvitations(invitationResult.data ?? []);
      } catch (error) {
        console.error("Error loading Friends screen:", error);
        Alert.alert(
          "Could not load Friends",
          error instanceof Error ? error.message : "Please try again.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      posthog.capture("friends_viewed");
      void loadData();
    }, [loadData, posthog]),
  );

  const handleCreateGroup = async () => {
    const name = groupName.trim();

    if (!name) {
      Alert.alert("Group name required", "Enter a name for your group.");
      return;
    }

    if (name.length > 50) {
      Alert.alert("Name too long", "Use 50 characters or fewer.");
      return;
    }

    setCreating(true);

    try {
      const { data, error } = await supabase.rpc("create_group", {
        p_name: name,
      });

      if (error) throw error;
      if (!data) throw new Error("No group ID was returned.");

      Sentry.logger.info("Group created", {
        operation: "create_group",
      });

      posthog.capture("group_created");

      setGroupName("");
      setModalVisible(false);
      await loadData();

      Alert.alert("Group created!", `${name} is ready.`);
    } catch (error) {
      Sentry.logger.error("Group creation failed", {
        operation: "create_group",
      });

      Sentry.captureException(error);

      posthog.capture("group_creation_failed", {
        failure_stage: "create_group",
      });

      console.error("Error creating group:", error);

      Alert.alert(
        "Could not create group",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleInvitationResponse = async (
    invitation: Invitation,
    response: "accepted" | "declined",
  ) => {
    setRespondingTo(invitation.invitation_id);

    try {
      const { error } = await supabase.rpc("respond_to_group_invitation", {
        p_invitation_id: invitation.invitation_id,
        p_response: response,
      });

      if (error) throw error;

      await loadData(false);

      Alert.alert(
        response === "accepted"
          ? "Invitation accepted!"
          : "Invitation declined",
        response === "accepted"
          ? `You have joined ${invitation.group_name}.`
          : `You declined the invitation to ${invitation.group_name}.`,
      );
    } catch (error) {
      console.error("Error responding to invitation:", error);
      Alert.alert(
        "Could not update invitation",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setRespondingTo(null);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    void loadData(false);
  };

  const renderInvitation = ({ item }: { item: Invitation }) => {
    const inviter = item.inviter_display_name?.trim() || item.inviter_username;
    const isResponding = respondingTo === item.invitation_id;

    return (
      <View style={styles.invitationCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.invitationIcon}>
            <Text style={styles.invitationIconText}>✉</Text>
          </View>

          <View style={styles.flex}>
            <Text style={styles.invitationGroupName}>{item.group_name}</Text>
            <Text style={styles.invitationDescription}>
              Invited by {inviter.startsWith("@") ? inviter : `@${inviter}`}
            </Text>
            <Text style={styles.invitationDate}>
              {new Date(item.invitation_created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={[
              styles.acceptButton,
              respondingTo !== null && styles.disabled,
            ]}
            onPress={() => void handleInvitationResponse(item, "accepted")}
            disabled={respondingTo !== null}
            accessibilityRole="button"
            accessibilityLabel={`Accept invitation to ${item.group_name}`}
          >
            {isResponding ? (
              <ActivityIndicator color={C.background} />
            ) : (
              <Text style={styles.acceptButtonText}>Accept invitation</Text>
            )}
          </Pressable>

          <Pressable
            style={[
              styles.declineButton,
              respondingTo !== null && styles.disabled,
            ]}
            onPress={() => void handleInvitationResponse(item, "declined")}
            disabled={respondingTo !== null}
            accessibilityRole="button"
            accessibilityLabel={`Decline invitation to ${item.group_name}`}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderGroup = ({ item }: { item: Group }) => (
    <Pressable
      style={({ pressed }) => [styles.groupCard, pressed && styles.cardPressed]}
      onPress={() =>
        router.push({
          pathname: "/group/[id]",
          params: { id: item.id },
        })
      }
      accessibilityRole="button"
      accessibilityLabel={`Open group ${item.name}`}
    >
      <View style={styles.groupIcon}>
        <Text style={styles.groupIconText}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.flex}>
        <Text style={styles.groupName}>{item.name}</Text>
        <Text style={styles.groupDate}>
          Created {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>

      <Text style={styles.groupArrow}>›</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>YOUR COMMUNITY</Text>
          <Text style={styles.title}>Friends</Text>
          <Text style={styles.subtitle}>Stay accountable, together.</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.createButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => setModalVisible(true)}
          accessibilityRole="button"
        >
          <Text style={styles.createButtonText}>+ Create</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.loadingText}>Loading your community...</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={styles.screenList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
              progressBackgroundColor={C.card}
            />
          }
          ListHeaderComponent={
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Incoming invitations</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{invitations.length}</Text>
                </View>
              </View>

              {invitations.length === 0 ? (
                <View style={styles.noInvitations}>
                  <Text style={styles.noInvitationsIcon}>✉</Text>
                  <View style={styles.flex}>
                    <Text style={styles.noInvitationsTitle}>All caught up</Text>
                    <Text style={styles.noInvitationsText}>
                      New group invitations will show up here.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.invitationList}>
                  {invitations.map((invitation) => (
                    <View key={invitation.invitation_id}>
                      {renderInvitation({ item: invitation })}
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.sectionHeader, styles.groupsHeader]}>
                <Text style={styles.sectionTitle}>Your groups</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{groups.length}</Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>+</Text>
              </View>
              <Text style={styles.emptyTitle}>Your circle starts here</Text>
              <Text style={styles.emptyDescription}>
                Create a group and invite friends to keep each other accountable
                on your fitness journey.
              </Text>
              <Pressable
                style={styles.emptyButton}
                onPress={() => setModalVisible(true)}
              >
                <Text style={styles.emptyButtonText}>
                  Create your first group
                </Text>
              </Pressable>
            </View>
          }
        />
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!creating) setModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!creating) setModalVisible(false);
            }}
          />

          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalEyebrow}>BUILD YOUR CIRCLE</Text>
            <Text style={styles.modalTitle}>Create a group</Text>
            <Text style={styles.modalDescription}>
              Give your group a name. You’ll be its owner and can invite friends
              next.
            </Text>

            <Text style={styles.inputLabel}>GROUP NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Fitness buddies"
              placeholderTextColor={C.muted}
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void handleCreateGroup()}
              editable={!creating}
              autoFocus
            />

            <Text style={styles.characterCount}>{groupName.length}/50</Text>

            <Pressable
              style={[styles.submitButton, creating && styles.disabled]}
              onPress={() => void handleCreateGroup()}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color={C.background} />
              ) : (
                <Text style={styles.submitButtonText}>Create group</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
              disabled={creating}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
    paddingTop: 58,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 7,
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 13,
    color: C.secondary,
  },
  createButton: {
    backgroundColor: C.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 13,
  },
  createButtonText: {
    color: C.background,
    fontWeight: "900",
    fontSize: 13,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  sectionHeader: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "800",
  },
  countBadge: {
    minWidth: 25,
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: "#252C1E",
    borderWidth: 1,
    borderColor: "#39482A",
  },
  countText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  groupsHeader: {
    marginTop: 26,
  },
  screenList: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    flexGrow: 1,
  },
  invitationList: {
    gap: 11,
  },
  invitationCard: {
    backgroundColor: C.card,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  invitationIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#252C1E",
    borderWidth: 1,
    borderColor: "#39482A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  invitationIconText: {
    color: C.accent,
    fontSize: 21,
    fontWeight: "800",
  },
  invitationGroupName: {
    fontSize: 15,
    fontWeight: "800",
    color: C.text,
  },
  invitationDescription: {
    fontSize: 12,
    color: C.secondary,
    marginTop: 5,
  },
  invitationDate: {
    fontSize: 10,
    color: C.muted,
    marginTop: 5,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 15,
  },
  acceptButton: {
    flex: 1,
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    borderRadius: 11,
    paddingHorizontal: 10,
  },
  acceptButtonText: {
    color: C.background,
    fontSize: 12,
    fontWeight: "900",
  },
  declineButton: {
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.input,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
  },
  declineButtonText: {
    color: C.secondary,
    fontSize: 12,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.55,
  },
  noInvitations: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  noInvitationsIcon: {
    color: C.accent,
    fontSize: 24,
  },
  noInvitationsTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
  },
  noInvitationsText: {
    color: C.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    padding: 15,
    marginBottom: 11,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardPressed: {
    opacity: 0.75,
  },
  groupIcon: {
    width: 49,
    height: 49,
    borderRadius: 16,
    backgroundColor: "#252C1E",
    borderWidth: 1,
    borderColor: "#39482A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },
  groupIconText: {
    color: C.accent,
    fontSize: 20,
    fontWeight: "900",
  },
  groupName: {
    fontSize: 15,
    fontWeight: "800",
    color: C.text,
  },
  groupDate: {
    fontSize: 11,
    color: C.secondary,
    marginTop: 5,
  },
  groupArrow: {
    fontSize: 26,
    color: C.accent,
    paddingLeft: 8,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: C.secondary,
    fontSize: 13,
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 28,
    paddingBottom: 30,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: "#252C1E",
    borderWidth: 1,
    borderColor: "#39482A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyIconText: {
    color: C.accent,
    fontSize: 34,
    fontWeight: "400",
  },
  emptyTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyDescription: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 9,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  emptyButtonText: {
    color: C.background,
    fontSize: 13,
    fontWeight: "900",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  modalContent: {
    backgroundColor: C.card,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#484848",
    alignSelf: "center",
    marginBottom: 22,
  },
  modalEyebrow: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
    marginBottom: 7,
  },
  modalTitle: {
    color: C.text,
    fontSize: 24,
    fontWeight: "900",
  },
  modalDescription: {
    color: C.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  inputLabel: {
    color: C.secondary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 9,
  },
  input: {
    height: 52,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    fontSize: 14,
    color: C.text,
    backgroundColor: C.input,
  },
  characterCount: {
    alignSelf: "flex-end",
    color: C.muted,
    fontSize: 11,
    marginTop: 7,
  },
  submitButton: {
    height: 51,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    marginTop: 18,
  },
  submitButtonText: {
    color: C.background,
    fontSize: 14,
    fontWeight: "900",
  },
  cancelButton: {
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  cancelButtonText: {
    color: C.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
});
