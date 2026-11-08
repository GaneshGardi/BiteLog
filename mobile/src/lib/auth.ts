import { supabase } from "./supabase";
import { Sentry } from "./sentry";
export async function getCurrentUser() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      Sentry.logger.error("Failed to get current session", {
        operation: "get_current_user",
      });

      Sentry.captureException(error);
      return null;
    }

    return session?.user ?? null;
  } catch (error) {
    Sentry.logger.error("Unexpected error getting current user", {
      operation: "get_current_user",
    });

    Sentry.captureException(error);
    return null;
  }
}

export async function isProfileComplete(userId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("birth_date, gender, height_cm, weight_kg, goal")
      .eq("id", userId)
      .single();

    if (error) {
      Sentry.logger.error("Failed to check profile completion", {
        operation: "check_profile_completion",
      });

      Sentry.captureException(error);
      return false;
    }

    return Boolean(
      data.birth_date &&
      data.gender &&
      data.height_cm &&
      data.weight_kg &&
      data.goal,
    );
  } catch (error) {
    Sentry.logger.error("Unexpected error checking profile completion", {
      operation: "check_profile_completion",
    });

    Sentry.captureException(error);
    return false;
  }
}
