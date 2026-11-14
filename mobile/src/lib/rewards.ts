import { supabase } from "./supabase";
import { getCurrentUser } from "./auth";
import { Sentry } from "./sentry";

export const MAX_DAILY_POINTS = 15;

export type RewardType =
  | "food_logged"
  | "consistency_bonus"
  | "calorie_goal_completed";

export type RewardLine = { type: RewardType; points: number };

export type RewardResult = {
  /** Points earned by THIS action only. */
  total: number;
  lines: RewardLine[];
  /** Total points earned today (after the action). */
  todayPoints: number;
  currentStreak: number;
};

export const EMPTY_REWARD: RewardResult = {
  total: 0,
  lines: [],
  todayPoints: 0,
  currentStreak: 0,
};

type Snapshot = { lines: RewardLine[]; streak: number };

async function snapshot(date: string): Promise<Snapshot | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const [tx, streak] = await Promise.all([
      supabase
        .from("point_transactions")
        .select("activity_type, points")
        .eq("user_id", user.id)
        .eq("activity_date", date),
      supabase
        .from("user_streaks")
        .select("current_streak")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (tx.error) throw tx.error;

    return {
      lines: (tx.data ?? []).map((r) => ({
        type: r.activity_type as RewardType,
        points: Number(r.points),
      })),
      streak: Number(streak.data?.current_streak ?? 0),
    };
  } catch (error) {
    // Rewards are a bonus layer. They must never break food logging.
    Sentry.captureException(error);
    return null;
  }
}

/**
 * Runs a food-logging action and works out which rewards it triggered.
 *
 * Points are still awarded 100% by the backend trigger. This only READS
 * point_transactions before and after, so the client never submits points.
 * Because (user, date, type) is unique, the diff is exact and duplicate-safe.
 */
export async function withRewards<T>(
  date: string,
  action: () => Promise<T>,
): Promise<{ value: T; rewards: RewardResult }> {
  const before = await snapshot(date);
  const value = await action();
  const after = before ? await snapshot(date) : null;

  if (!before || !after) return { value, rewards: EMPTY_REWARD };

  const had = new Set(before.lines.map((l) => l.type));
  const lines = after.lines.filter((l) => !had.has(l.type));

  return {
    value,
    rewards: {
      total: lines.reduce((s, l) => s + l.points, 0),
      lines,
      todayPoints: after.lines.reduce((s, l) => s + l.points, 0),
      currentStreak: after.streak,
    },
  };
}
