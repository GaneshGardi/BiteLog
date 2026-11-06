
import * as Sentry from '@sentry/react-native';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn,
  environment: __DEV__ ? 'development' : 'production',

  // Capture a sample of app performance data.
  tracesSampleRate: 0.1,

  // Enable Sentry structured logs.
  enableLogs: true,

  // Do not send default personal information or screen contents.
  sendDefaultPii: false,
  attachScreenshot: false,
  attachViewHierarchy: false,
});

export { Sentry };
