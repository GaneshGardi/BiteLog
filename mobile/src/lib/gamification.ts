import { supabase } from "./supabase";
import { Sentry } from "./sentry";

/** Maximum points a user can earn in one day. */
export const DAILY_POINT_CAP = 15;

/** A day counts toward the streak at 85%-105% of the daily goal. */
export const TARGET_RANGE_LABEL = "85-105%";

export type LeaderboardEntry = {
  user_id: string;
  username: string;
  display_name: string | null;
  week_start: string;
  week_points: number;
  today_points: number;
  current_streak: number;
  /** Points earned Monday..Sunday (always 7 numbers). */
  day_points: number[];
  rank: number;
};

export type GroupRank = {
  group_id: string;
  group_name: string;
  member_count: number;
  my_rank: number;
  my_points: number;
  /** Points needed to pass the person directly above. null when you lead. */
  points_to_next: number | null;
};

export type GamificationSummary = {
  todayPoints: number;
  weekPoints: number;
  currentStreak: number;
  qualifiedToday: boolean;
  bestGroup: GroupRank | null;
  groupCount: number;
};

/* ------------------------------------------------------------------ */
/* Date helpers (device-local calendar dates, like food_logs.log_date) */
/* ------------------------------------------------------------------ */

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateString(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

export function getLocalDateString(date: Date = new Date()) {
  return toDateString(date);
}

/** Adds (or subtracts) whole days from a YYYY-MM-DD string. */
export function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  return toDateString(new Date(year, month - 1, day + days));
}

/** Monday of the week containing the given date (matches the database). */
export function getWeekStartString(date: Date = new Date()) {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return toDateString(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday),
  );
}

/** Monday of the week containing a YYYY-MM-DD date string. */
export function getWeekStartFromDateString(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return getWeekStartString(new Date(year, month - 1, day));
}

/** "9 Nov - 15 Nov" for a Monday start date. */
export function formatWeekRange(weekStart: string) {
  const [year, month, day] = weekStart.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 6);
  const format = (date: Date) =>
    date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return `${format(start)} - ${format(end)}`;
}

/* ------------------------------------------------------------------ */
/* Group leaderboard                                                   */
/* ------------------------------------------------------------------ */

export async function fetchGroupLeaderboard(
  groupId: string,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_group_leaderboard", {
    p_group_id: groupId,
    p_today: getLocalDateString(),
  });

  if (error) throw error;

  return ((data ?? []) as LeaderboardEntry[]).map((row) => ({
    ...row,
    week_points: Number(row.week_points) || 0,
    today_points: Number(row.today_points) || 0,
    current_streak: Number(row.current_streak) || 0,
    rank: Number(row.rank) || 0,
    day_points: Array.from({ length: 7 }, (_, index) =>
      Number(row.day_points?.[index] ?? 0),
    ),
  }));
}

/* ------------------------------------------------------------------ */
/* Home screen summary                                                 */
/* ------------------------------------------------------------------ */

/**
 * Loads the signed-in user's points, streak and best group rank.
 *
 * This function NEVER throws. If gamification data is unavailable
 * (for example, a migration has not been applied yet) it returns null
 * so the rest of the dashboard keeps working exactly as before.
 */
export async function fetchGamificationSummary(
  userId: string,
  today: string,
): Promise<GamificationSummary | null> {
  try {
    const weekStart = getWeekStartFromDateString(today);
    const weekEnd = addDays(weekStart, 6);

    const [activityResult, streakResult, ranksResult] = await Promise.all([
      supabase
        .from("daily_activity")
        .select("activity_date, points_earned, qualifying_day")
        .eq("user_id", userId)
        .gte("activity_date", weekStart)
        .lte("activity_date", weekEnd),

      supabase
        .from("user_streaks")
        .select("current_streak, last_qualifying_date")
        .eq("user_id", userId)
        .maybeSingle(),

      supabase.rpc("get_my_group_ranks", { p_today: today }),
    ]);

    if (activityResult.error) throw activityResult.error;

    const activity = activityResult.data ?? [];
    const todayRow = activity.find((row) => row.activity_date === today);

    const weekPoints = activity.reduce(
      (sum, row) => sum + (Number(row.points_earned) || 0),
      0,
    );

    // A stored streak is only alive if the last qualifying day was
    // yesterday or today. Otherwise it has been broken.
    let currentStreak = 0;
    if (!streakResult.error && streakResult.data?.last_qualifying_date) {
      const last = String(streakResult.data.last_qualifying_date);
      if (last >= addDays(today, -1)) {
        currentStreak = Number(streakResult.data.current_streak) || 0;
      }
    }

    let groupRanks: GroupRank[] = [];
    if (ranksResult.error) {
      Sentry.captureException(ranksResult.error);
    } else {
      groupRanks = ((ranksResult.data ?? []) as GroupRank[]).map((row) => ({
        ...row,
        member_count: Number(row.member_count) || 0,
        my_rank: Number(row.my_rank) || 0,
        my_points: Number(row.my_points) || 0,
        points_to_next:
          row.points_to_next == null ? null : Number(row.points_to_next),
      }));
    }

    return {
      todayPoints: Number(todayRow?.points_earned) || 0,
      weekPoints,
      currentStreak,
      qualifiedToday: Boolean(todayRow?.qualifying_day),
      bestGroup: groupRanks[0] ?? null,
      groupCount: groupRanks.length,
    };
  } catch (error) {
    Sentry.logger.error("Gamification summary failed to load", {
      operation: "load_gamification_summary",
    });
    Sentry.captureException(error);
    return null;
  }
}