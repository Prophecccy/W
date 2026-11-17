import { useState, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { motion } from "framer-motion";
import { MobileNav } from "../../shared/components/MobileNav/MobileNav";
import { QuickAddSheet } from "../components/QuickAddSheet/QuickAddSheet";
import { useTimeLeft } from "../../features/dashboard/hooks/useTimeLeft";
import { User } from "../../shared/types";
import { SPRING_TACTILE } from "../../shared/constants/motion";
import { playMechanicalClick, playSubtleThud } from "../../shared/services/tactileAudioService";
import "./MobileLayout.css";

interface MobileLayoutProps {
  userDoc: User | null;
  strikes?: any;
  globalStreak?: number;
  isLocked?: boolean;
  habitsCount?: number;
  todosCount?: number;
  onOpenCommandPalette?: () => void;
  children: ReactNode;
}

export function MobileLayout({
  userDoc,
  strikes,
  isLocked = false,
  habitsCount = 0,
  todosCount = 0,
  onOpenCommandPalette,
  children,
}: MobileLayoutProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const location = useLocation();
  const isDashboard = location.pathname === "/";

  const timeLeft = useTimeLeft(
    userDoc?.settings?.wakeUpTime || "07:00",
    userDoc?.settings?.bedTime || "23:00"
  );

  const strikeCount = strikes?.current ?? userDoc?.strikes?.current ?? 0;
  const isStrikeEnabled = userDoc?.settings?.strikeSystemEnabled ?? true;

  return (
    <div className="mobile-shell">
      {/* ─── Tactical Mobile Header ─── */}
      <header className="mobile-shell__header">
        <div className="mobile-shell__brand">
          <span className="mobile-shell__logo">[ W ]</span>
          <span className="mobile-shell__build-tag">ANDROID</span>
        </div>

        <div className="mobile-shell__telemetry-pill">
          <span className="mobile-shell__fuel-val">
            {timeLeft.phase === "sleeping" ? "[ SLEEP ]" : `[ ${Math.round(timeLeft.percent)}% FUEL ]`}
          </span>
        </div>

        <div className="mobile-shell__actions">
          {onOpenCommandPalette && (
            <motion.button
              type="button"
              className="mobile-shell__icon-btn"
              whileTap={{ scale: 0.92 }}
              transition={SPRING_TACTILE}
              onClick={() => {
                playMechanicalClick();
                onOpenCommandPalette();
              }}
              aria-label="Search and Commands"
            >
              <Search size={17} strokeWidth={2} />
            </motion.button>
          )}
        </div>
      </header>

      {/* ─── Main Touch Viewport Scroll Container ─── */}
      <main className="mobile-shell__content" id="mobile-main-scroll">
        {children}
      </main>

      {/* ─── Floating Tactical Action Button (FAB) (Dashboard only) ─── */}
      {isDashboard && !isLocked && (
        <motion.button
          type="button"
          className="mobile-shell__fab"
          whileTap={{ scale: 0.92 }}
          transition={SPRING_TACTILE}
          onClick={() => {
            playSubtleThud();
            setQuickAddOpen(true);
          }}
          aria-label="Quick Add Protocol or Directive"
        >
          <Plus size={22} strokeWidth={2.5} />
        </motion.button>
      )}

      {/* ─── Bottom Navigation Dock ─── */}
      <footer className="mobile-shell__footer">
        <MobileNav
          strikeCount={strikeCount}
          strikeSystemEnabled={isStrikeEnabled}
          habitsCount={habitsCount}
          todosCount={todosCount}
          isLocked={isLocked}
          isFrozen={!!userDoc?.freeze?.active}
        />
      </footer>

      {/* ─── Quick Add Bottom Sheet ─── */}
      <QuickAddSheet
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
      />
    </div>
  );
}
