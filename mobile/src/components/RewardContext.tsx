import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePostHog } from "posthog-react-native";

import RewardBadge from "../components/RewardBadge";
import { EMPTY_REWARD, type RewardResult } from "../lib/rewards";

type ShowRewardOptions = {
  /** Shown under the points, usually the food name. */
  subtitle?: string;
  /** Runs after the badge closes (e.g. router.back()). */
  onClose?: () => void;
};

type RewardContextValue = {
  showReward: (result: RewardResult, options?: ShowRewardOptions) => void;
};

type State = {
  result: RewardResult;
  options: ShowRewardOptions;
};

const RewardContext = createContext<RewardContextValue | undefined>(undefined);

export function RewardProvider({ children }: { children: ReactNode }) {
  const posthog = usePostHog();
  const [state, setState] = useState<State | null>(null);

  const showReward = useCallback(
    (result: RewardResult, options: ShowRewardOptions = {}) => {
      posthog.capture("reward_badge_shown", {
        points: result.total,
        reward_types: result.lines.map((l) => l.type),
      });
      setState({ result, options });
    },
    [posthog],
  );

  const handleClose = useCallback(() => {
    const onClose = state?.options.onClose;
    setState(null);
    onClose?.();
  }, [state]);

  const value = useMemo(() => ({ showReward }), [showReward]);

  return (
    <RewardContext.Provider value={value}>
      {children}
      <RewardBadge
        visible={state !== null}
        result={state?.result ?? EMPTY_REWARD}
        subtitle={state?.options.subtitle}
        onClose={handleClose}
      />
    </RewardContext.Provider>
  );
}

export function useReward() {
  const ctx = useContext(RewardContext);
  if (!ctx) throw new Error("useReward must be used inside RewardProvider");
  return ctx;
}
