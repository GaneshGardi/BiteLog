import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { usePostHog } from "posthog-react-native";

import {
  markNotificationOpened,
  syncPushTokenIfGranted,
} from "../lib/notifications";

type NotificationData = {
  kind?: string;
  route?: "home" | "friends" | "group";
  groupId?: string | null;
  notificationId?: string | null;
};

/**
 * - Silently refreshes the push token/timezone once the user is signed in
 *   (only if permission was already granted, so no surprise prompts).
 * - Opens the right screen when a notification is tapped, including when
 *   it launched the app from a closed state.
 *
 * `ready` must be true only once the session is known and the user is
 * signed in.
 */
export function useNotificationRouting(ready: boolean) {
  const router = useRouter();
  const posthog = usePostHog();
  const response = Notifications.useLastNotificationResponse();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (ready) {
      void syncPushTokenIfGranted();
    }
  }, [ready]);

  useEffect(() => {
    if (!ready || !response) return;

    if (
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      return;
    }

    const identifier = response.notification.request.identifier;

    // Handle each tap exactly once.
    if (handledRef.current === identifier) return;
    handledRef.current = identifier;

    const data = response.notification.request.content.data as
      | NotificationData
      | undefined;

    posthog.capture("notification_opened", { kind: data?.kind ?? "unknown" });
    void markNotificationOpened(data?.notificationId);

    if (data?.route === "group" && data.groupId) {
      router.push({
        pathname: "/group/[id]",
        params: { id: data.groupId },
      });
      return;
    }

    if (data?.route === "friends") {
      router.navigate("/friends");
      return;
    }

    router.navigate("/");
  }, [ready, response, router, posthog]);
}