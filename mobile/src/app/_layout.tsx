import { Sentry } from "../lib/sentry";

import { useEffect, useRef, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { View } from "react-native";
import { PostHogProvider, usePostHog } from "posthog-react-native";

import { supabase } from "../lib/supabase";
import { AnimatedSplashOverlay } from "../components/animated-icon";

function RootLayoutContent() {
  const router = useRouter();
  const segments = useSegments();
  const posthog = usePostHog();

  const identifiedUserId = useRef<string | null>(null);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    let mounted = true;

    Sentry.logger.info("BiteLog app started");

    // Record one app-open event per app launch.
    posthog.capture("app_opened");

    function syncSession(session: any) {
      if (!mounted) return;

      const userId = session?.user?.id ?? null;

      // Avoid identifying the same user multiple times.
      if (userId !== identifiedUserId.current) {
        if (userId) {
          // Use only the pseudonymous Supabase UUID.
          posthog.identify(userId);
        } else if (identifiedUserId.current) {
          // Reset analytics identity after logout.
          posthog.reset();
        }

        identifiedUserId.current = userId;
      }

      Sentry.setUser(session?.user ? { id: session.user.id } : null);

      setIsAuthenticated(!!session);
      setSessionLoading(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session);
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Failed to restore auth session:", error);
      }

      syncSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [posthog]);

  useEffect(() => {
    if (sessionLoading) return;

    const currentRoute = segments[0];

    const isAuthRoute = currentRoute === "login" || currentRoute === "signup";

    if (!isAuthenticated && !isAuthRoute) {
      router.replace("/login");
      return;
    }

    if (isAuthenticated && isAuthRoute) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, sessionLoading, segments, router]);

  const showSplash = !animationFinished || sessionLoading;

  return (
    <View style={{ flex: 1, backgroundColor: "#101010" }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#101010",
          },
        }}
      />

      {showSplash && (
        <AnimatedSplashOverlay onFinish={() => setAnimationFinished(true)} />
      )}
    </View>
  );
}

function RootLayout() {
  return (
    <PostHogProvider
      projectToken={process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? ""}
      options={{
        host:
          process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
      }}
      autocapture={false}
    >
      <RootLayoutContent />
    </PostHogProvider>
  );
}

export default Sentry.wrap(RootLayout);
