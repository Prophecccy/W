import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { StrikeState, MAX_STRIKES } from "../types";
import { addStrike, resetStrikes } from "../services/strikeService";

interface UseStrikesReturn {
  strikes: StrikeState;
  isLocked: boolean;
  loading: boolean;
  addStrike: (habitId: string, habitTitle: string, reason?: "missed" | "manual") => Promise<void>;
  resolve: () => Promise<void>;
}

const DEFAULT_STATE: StrikeState = {
  current: 0,
  total: 0,
  lastStrikeDate: null,
  history: [],
};

export function useStrikes(): UseStrikesReturn {
  const [strikes, setStrikes] = useState<StrikeState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStrikes((data.strikes ?? DEFAULT_STATE) as StrikeState);
      }
      setLoading(false);
    });

    return unsub;
  }, []);

  const handleAddStrike = async (
    habitId: string,
    habitTitle: string,
    reason: "missed" | "manual" = "missed"
  ) => {
    await addStrike(habitId, habitTitle, reason);
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
