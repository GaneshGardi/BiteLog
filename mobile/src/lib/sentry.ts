
import * as Sentry from '@sentry/react-native';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

const sentryEnvironment =
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ??
  (__DEV__ ? 'development' : 'production');

Sentry.init({
  dsn: sentryDsn,
  environment: sentryEnvironment,

  tracesSampleRate: 0.1,

  enableLogs: true,

  sendDefaultPii: false,
  attachScreenshot: false,
  attachViewHierarchy: false,
});

export { Sentry };
