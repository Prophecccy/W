import { useState, useEffect } from "react";
import { db, doc, onSnapshot } from "../../../shared/config/firebase";
import { StrikeState, MAX_STRIKES } from "../types";
import { addStrike, resetStrikes } from "../services/strikeService";
import { useAuthContext } from "../../auth/context";

interface UseStrikesReturn {
  strikes: StrikeState;
  isLocked: boolean;
  loading: boolean;
  addStrike: (
    habitId: string,
    habitTitle: string,
    reason?: "missed" | "manual" | "lockdown_violation" | "snoozed_high_stakes" | "limiter_exceeded"
  ) => Promise<void>;
  resolve: () => Promise<void>;
}

const DEFAULT_STATE: StrikeState = {
  current: 0,
  total: 0,
  lastStrikeDate: null,
  history: [],
};

export function useStrikes(): UseStrikesReturn {
  const { user } = useAuthContext();
  const [strikes, setStrikes] = useState<StrikeState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStrikes(DEFAULT_STATE);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStrikes((data.strikes ?? DEFAULT_STATE) as StrikeState);
      }
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const handleAddStrike = async (
    habitId: string,
    habitTitle: string,
    reason?: "missed" | "manual" | "lockdown_violation" | "snoozed_high_stakes" | "limiter_exceeded"
  ) => {
    await addStrike(habitId, habitTitle, reason || "missed");
    // State updates via onSnapshot listener automatically
  };

  const handleResolve = async () => {
    await resetStrikes();
    // State updates via onSnapshot listener automatically
  };

  return {
    strikes,
    isLocked: strikes.current >= MAX_STRIKES,
    loading,
    addStrike: handleAddStrike,
    resolve: handleResolve,
  };
}
