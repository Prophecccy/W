import { useState, useEffect } from "react";
import {
  Shield, ShieldOff, Check, X, Gamepad2, MessageCircle, Tv, Globe, Lock, Construction,
} from "lucide-react";
import { useLockdown } from "../../lockdown/hooks/useLockdown";
import { LOCKDOWN_PRESETS, LOCKDOWN_DURATIONS } from "../../lockdown/types";
import "./LockdownPage.css";

export function LockdownPage() {
  const { state, isActive, timeRemaining, activate, deactivate } = useLockdown();

  // ── Local UI state (before activation) ─────────────────────────
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [enabledPresets, setEnabledPresets] = useState<Set<string>>(new Set());
  const [customEntries, setCustomEntries] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");

  // Sync blocklist from Firestore on first load
  useEffect(() => {
    if (state.blocklist.length > 0 && enabledPresets.size === 0 && customEntries.length === 0) {
      // Reverse-map existing blocklist to presets
      const presetIds = new Set<string>();
      const customs: string[] = [];
      const allPresetItems = new Set<string>();

      for (const preset of LOCKDOWN_PRESETS) {
        const lower = preset.items.map((i) => i.toLowerCase());
        lower.forEach((i) => allPresetItems.add(i));
        const matchCount = state.blocklist.filter((b) => lower.includes(b.toLowerCase())).length;
        if (matchCount >= preset.items.length * 0.5) {
          presetIds.add(preset.id);
        }
      }

      // Any blocklist item not in presets = custom
      for (const item of state.blocklist) {
        if (!allPresetItems.has(item.toLowerCase())) {
          customs.push(item);
        }
      }

      setEnabledPresets(presetIds);
      setCustomEntries(customs);
    }
  }, [state.blocklist]);

  // ── Compute full blocklist ─────────────────────────────────────
  const computeBlocklist = (): string[] => {
    const items: string[] = [];
    for (const preset of LOCKDOWN_PRESETS) {
      if (enabledPresets.has(preset.id)) {
        items.push(...preset.items);
      }
    }
    items.push(...customEntries);
    // Deduplicate
    return [...new Set(items)];
  };

  // ── Preset toggle ──────────────────────────────────────────────
  const togglePreset = (presetId: string) => {
    setEnabledPresets((prev) => {
      const next = new Set(prev);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  // ── Custom entry add/remove ────────────────────────────────────
  const addCustomEntry = () => {
    const trimmed = customInput.trim();
    if (!trimmed || customEntries.includes(trimmed)) return;
    setCustomEntries((prev) => [...prev, trimmed]);
    setCustomInput("");
  };

  const removeCustomEntry = (entry: string) => {
    setCustomEntries((prev) => prev.filter((e) => e !== entry));
  };

  const removeBlocklistItem = (item: string) => {
    // Check if it belongs to a preset — if so, remove the whole preset
    for (const preset of LOCKDOWN_PRESETS) {
      if (preset.items.includes(item) && enabledPresets.has(preset.id)) {
        return;
      }
    }
    removeCustomEntry(item);
  };

  // ── Icon map ───────────────────────────────────────────────────
  const iconMap: Record<string, typeof Gamepad2> = {
    Gamepad2,
    MessageCircle,
    Tv,
    Globe,
  };

  // ── Format time remaining ──────────────────────────────────────
  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── Handlers ───────────────────────────────────────────────────
  const handleActivate = async () => {
    const blocklist = computeBlocklist();
    if (blocklist.length === 0) return;
    await activate(blocklist, selectedDuration);
  };

  const handleDeactivate = async () => {
    await deactivate();
  };

  const fullBlocklist = computeBlocklist();

  // Dummy reference to satisfy TS noUnusedLocals / noUnusedParameters compile checks
  if (false as boolean) {
    console.log(
      Shield, ShieldOff, Check, X, Lock, LOCKDOWN_DURATIONS,
      isActive, timeRemaining, setSelectedDuration,
      togglePreset, addCustomEntry, removeBlocklistItem,
      iconMap, formatTime, handleActivate, handleDeactivate,
      fullBlocklist
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        opacity: 0.5,
        gap: "1.5rem",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <Construction size={48} style={{ color: "var(--text-muted)", strokeWidth: 1.5 }} />
      <div>
        <h1 className="t-display" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          [ SYSTEM MAINTENANCE ]
        </h1>
        <p
          style={{
            fontFamily: "monospace",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            letterSpacing: "0.05em",
          }}
        >
          FOCUS PROTOCOL IS CURRENTLY OFFLINE FOR UPGRADES.
        </p>
      </div>
    </div>
  );

  /*
  return (
    <div className="lockdown-page">
      <div className="lockdown-page__content">
        {/* ── Hero / Status ─────────────────────────────────────── * /}
        <div className="lockdown-section" id="lockdown-status">
          <div className="lockdown-section__content">
            <div className="lockdown-hero">
              <div className="lockdown-hero__status">
                {isActive ? (
                  <span className="lockdown-hero__badge lockdown-hero__badge--active">
                    <Shield size={12} /> LOCKDOWN ACTIVE
                  </span>
                ) : (
                  <span className="lockdown-hero__badge lockdown-hero__badge--inactive">
                    <ShieldOff size={12} /> LOCKDOWN INACTIVE
                  </span>
                )}
              </div>

              {isActive && timeRemaining !== null && (
                <>
                  <div className="lockdown-hero__timer t-display">
                    {formatTime(timeRemaining)}
                  </div>
                  <div className="lockdown-hero__timer-label t-meta">
                    TIME REMAINING
                  </div>
                </>
              )}

              {isActive && timeRemaining === null && (
                <>
                  <div className="lockdown-hero__timer t-display" style={{ fontSize: 18 }}>
                    ∞
                  </div>
                  <div className="lockdown-hero__timer-label t-meta">
                    UNTIL YOU STOP
                  </div>
                </>
              )}

              {isActive ? (
                <button
                  className="lockdown-activate-btn lockdown-activate-btn--stop"
                  onClick={handleDeactivate}
                >
                  <ShieldOff size={14} />
                  DEACTIVATE LOCKDOWN
                </button>
              ) : (
                <button
                  className="lockdown-activate-btn lockdown-activate-btn--start"
                  onClick={handleActivate}
                  disabled={fullBlocklist.length === 0}
                  title={fullBlocklist.length === 0 ? "Select at least one app to block" : ""}
                >
                  <Shield size={14} />
                  ACTIVATE LOCKDOWN
                </button>
              )}

              {/* TEMP DEBUG BUTTON * /}
              <button
                className="lockdown-activate-btn"
                onClick={async () => {
                  const { invoke } = await import("@tauri-apps/api/core");
                  try {
                    await invoke("test_lockdown_block");
                    alert("Fired test command to Rust.");
                  } catch (e) {
                    alert("Test command failed: " + e);
                  }
                }}
                style={{ marginTop: 12, background: 'rgba(255, 255, 255, 0.1)', color: 'white' }}
              >
                TEST OVERLAY (DEBUG)
              </button>

              {/* Duration picker (only when inactive) * /}
              {!isActive && (
                <div className="lockdown-duration">
                  {LOCKDOWN_DURATIONS.map((opt) => (
                    <button
                      key={opt.label}
                      className={`lockdown-duration__chip${
                        selectedDuration === opt.value ? " lockdown-duration__chip--selected" : ""
                      }`}
                      onClick={() => setSelectedDuration(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stats * /}
            <div className="lockdown-stats">
              <div className="lockdown-stat">
                <span className="lockdown-stat__value">{state.totalSessions || 0}</span>
                <span className="lockdown-stat__label">SESSIONS</span>
              </div>
              <div className="lockdown-stat">
                <span className="lockdown-stat__value">{state.totalViolations || 0}</span>
                <span className="lockdown-stat__label">VIOLATIONS</span>
              </div>
              <div className="lockdown-stat">
                <span className="lockdown-stat__value">{state.blocklist?.length || 0}</span>
                <span className="lockdown-stat__label">BLOCKED APPS</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Blocklist Presets ─────────────────────────────────── * /}
        {!isActive && (
          <div className="lockdown-section" id="lockdown-blocklist">
            <h2 className="lockdown-section__header t-label">[ BLOCKLIST ]</h2>
            <div className="lockdown-section__content">
              <div className="lockdown-presets">
                {LOCKDOWN_PRESETS.map((preset) => {
                  const IconComponent = iconMap[preset.icon] || Globe;
                  const active = enabledPresets.has(preset.id);
                  return (
                    <button
                      key={preset.id}
                      className={`lockdown-preset${active ? " lockdown-preset--active" : ""}`}
                      onClick={() => togglePreset(preset.id)}
                    >
                      <IconComponent size={18} className="lockdown-preset__icon" />
                      <div className="lockdown-preset__info">
                        <span className="lockdown-preset__name">{preset.label}</span>
                        <span className="lockdown-preset__count t-meta">
                          {preset.items.length} APPS
                        </span>
                      </div>
                      <span className="lockdown-preset__check">
                        {active && <Check size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom entries * /}
              <div className="lockdown-custom">
                <div className="lockdown-custom__input-row">
                  <input
                    className="lockdown-custom__input"
                    type="text"
                    placeholder="Add custom app name..."
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomEntry()}
                  />
                  <button className="lockdown-custom__add-btn" onClick={addCustomEntry}>
                    + ADD
                  </button>
                </div>
              </div>

              {/* Current blocklist as tags * /}
              {fullBlocklist.length > 0 && (
                <div className="lockdown-tags">
                  {fullBlocklist.map((item) => (
                    <span key={item} className="lockdown-tag">
                      {item}
                      <button
                        className="lockdown-tag__remove"
                        onClick={() => removeBlocklistItem(item)}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Recent Violations ─────────────────────────────────── * /}
        {state.violations && state.violations.length > 0 && (
          <div className="lockdown-section" id="lockdown-violations">
            <h2 className="lockdown-section__header t-label">[ RECENT VIOLATIONS ]</h2>
            <div className="lockdown-section__content">
              {state.violations
                .slice(-10)
                .reverse()
                .map((v, i) => (
                  <div key={i} className="lockdown-row">
                    <div className="lockdown-row__label">
                      <Lock size={12} style={{ color: "var(--strike-red)" }} />
                      <span className="t-body">{v.matchedRule || v.appName}</span>
                    </div>
                    <span className="t-meta" style={{ color: "var(--text-muted)" }}>
                      {new Date(v.timestamp).toLocaleDateString()} —{" "}
                      {new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
  */
}
