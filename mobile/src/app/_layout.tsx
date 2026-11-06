
import { Sentry } from '../lib/sentry';

import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View } from 'react-native';

import { supabase } from '../lib/supabase';
import { AnimatedSplashOverlay } from '../components/animated-icon';

function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [sessionLoading, setSessionLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    let mounted = true;

     Sentry.logger.info('BiteLog app started');
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        Sentry.setUser(
          session?.user ? { id: session.user.id } : null
        );

        setIsAuthenticated(!!session);
        setSessionLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;

      if (error) {
        console.error('Failed to restore auth session:', error);
      }

      Sentry.setUser(
        session?.user ? { id: session.user.id } : null
      );

      setIsAuthenticated(!!session);
      setSessionLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (sessionLoading) return;

    const currentRoute = segments[0];

    const isAuthRoute =
      currentRoute === 'login' || currentRoute === 'signup';

    if (!isAuthenticated && !isAuthRoute) {
      router.replace('/login');
      return;
    }

    if (isAuthenticated && isAuthRoute) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, sessionLoading, segments, router]);

  const showSplash = !animationFinished || sessionLoading;

  return (
    <View style={{ flex: 1, backgroundColor: '#101010' }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#101010',
          },
        }}
      />

      {showSplash && (
        <AnimatedSplashOverlay
          onFinish={() => setAnimationFinished(true)}
        />
      )}
    </View>
  );
}

export default Sentry.wrap(RootLayout);
