import { useState, useEffect } from "react";
import {
  Shield, ShieldOff, Check, X, Gamepad2, MessageCircle, MessageSquare, Tv, Globe, Lock, ShoppingBag, Newspaper, Cpu, Plus, Minus, ChevronDown
} from "lucide-react";
import { useLockdown } from "../../lockdown/hooks/useLockdown";
import { LOCKDOWN_PRESETS, LOCKDOWN_DURATIONS } from "../../lockdown/types";
import { LockdownLogo } from "./LockdownLogo";
import { TimeInput } from "../../../shared/components/RadialTimePicker/TimeInput";
import "./LockdownPage.css";

function getAppIcon(appName: string) {
  const name = appName.toLowerCase();
  
  // Gaming targets
  if (
    name.includes("steam") ||
    name.includes("epic") ||
    name.includes("riot") ||
    name.includes("battle.net") ||
    name.includes("battlenet") ||
    name.includes("origin") ||
    name.includes("gog") ||
    name.includes("ubisoft") ||
    name.includes("ea") ||
    name.includes("xbox") ||
    name.includes("minecraft") ||
    name.includes("valorant") ||
    name.includes("league") ||
    name.includes("cs2") ||
    name.includes("dota") ||
    name.includes("overwatch") ||
    name.includes("apex") ||
    name.includes("roblox") ||
    name.includes("fortnite") ||
    name.includes("cod") ||
    name.includes("gta") ||
    name.includes("rainbow") ||
    name.includes("elden") ||
    name.includes("helldiver") ||
    name.includes("genshin") ||
    name.includes("starrail") ||
    name.includes("cyberpunk") ||
    name.includes("palworld") ||
    name.includes("deadlock") ||
    name.includes("marvel") ||
    name.includes("game")
  ) {
    return Gamepad2;
  }
  
  // Chats & Socials
  if (
    name.includes("discord") ||
    name.includes("slack") ||
    name.includes("whatsapp") ||
    name.includes("telegram") ||
    name.includes("messenger") ||
    name.includes("teams") ||
    name.includes("zoom") ||
    name.includes("reddit") ||
    name.includes("twitter") ||
    name.includes("instagram") ||
    name.includes("facebook") ||
    name.includes("tiktok") ||
    name.includes("linkedin") ||
    name.includes("social") ||
    name === "x.exe"
  ) {
    return MessageSquare;
  }
  
  // Browsers
  if (
    name.includes("chrome") ||
    name.includes("firefox") ||
    name.includes("edge") ||
    name.includes("opera") ||
    name.includes("brave") ||
    name.includes("safari") ||
    name.includes("browser") ||
    name.includes("web")
  ) {
    return Globe;
  }
  
  // Entertainment / Media
  if (
    name.includes("youtube") ||
    name.includes("spotify") ||
    name.includes("netflix") ||
    name.includes("twitch") ||
    name.includes("vlc") ||
    name.includes("hulu") ||
    name.includes("prime") ||
    name.includes("disney") ||
    name.includes("tv") ||
    name.includes("music") ||
    name.includes("play")
  ) {
    return Tv;
  }
  
  // Shopping / Trading
  if (
    name.includes("amazon") ||
    name.includes("ebay") ||
    name.includes("shopify") ||
    name.includes("trade") ||
    name.includes("binance") ||
    name.includes("coinbase") ||
    name.includes("robinhood") ||
    name.includes("market")
  ) {
    return ShoppingBag;
  }

  // News / Feeds
  if (
    name.includes("news") ||
    name.includes("feed") ||
    name.includes("paper") ||
    name.includes("read")
  ) {
    return Newspaper;
  }
  
  // General executable / script fallback
  return Cpu;
}

function getComplementaryColor(hex: string) {
  // Strip # if present
  let color = hex.replace("#", "");
  if (color.length === 3) {
    color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
  }
  if (color.length !== 6) {
    return {
      hsl: "var(--strike-red)",
      rgb: "232, 115, 108"
    };
  }

  const rVal = parseInt(color.substring(0, 2), 16);
  const gVal = parseInt(color.substring(2, 4), 16);
  const bVal = parseInt(color.substring(4, 6), 16);

  const r = rVal / 255;
  const g = gVal / 255;
  const b = bVal / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  // Convert to degrees (0 - 360)
  let hue = Math.round(h * 360);
  
  // Rotate hue by 180 degrees for complementary color
  hue = (hue + 180) % 360;

  // Let's keep the saturation and lightness high/balanced for vibrant display
  const sat = Math.round(s * 100);
  const light = Math.round(l * 100);

  // Convert rotated HSL back to RGB coordinates
  const hDecimal = hue / 360;
  const sDecimal = sat / 100;
  const lDecimal = light / 100;
  
  let rResult, gResult, bResult;
  if (sDecimal === 0) {
    rResult = gResult = bResult = lDecimal; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = lDecimal < 0.5 ? lDecimal * (1 + sDecimal) : lDecimal + sDecimal - lDecimal * sDecimal;
    const p = 2 * lDecimal - q;
    
    rResult = hue2rgb(p, q, hDecimal + 1/3);
    gResult = hue2rgb(p, q, hDecimal);
    bResult = hue2rgb(p, q, hDecimal - 1/3);
  }

  const redRGB = Math.round(rResult * 255);
  const greenRGB = Math.round(gResult * 255);
  const blueRGB = Math.round(bResult * 255);

  return {
    hsl: `hsl(${hue}, ${sat}%, ${light}%)`,
    rgb: `${redRGB}, ${greenRGB}, ${blueRGB}`
  };
}

export function LockdownPage() {
  const { state, isActive, timeRemaining, activate, deactivate, loading, schedules, saveSchedules } = useLockdown();

  // ── Local UI state (before activation) ─────────────────────────
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [expandedPresets, setExpandedPresets] = useState<Set<string>>(new Set());
  const [customEntries, setCustomEntries] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);

  // ── Scheduled Lockdown UI state ────────────────────────────────
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleStartTime, setScheduleStartTime] = useState("09:00");
  const [scheduleEndTime, setScheduleEndTime] = useState("17:00");
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [scheduleApps, setScheduleApps] = useState<string[]>([]);
  const [expandedSchedulePresets, setExpandedSchedulePresets] = useState<Set<string>>(new Set());
  const [scheduleCustoms, setScheduleCustoms] = useState<string[]>([]);
  const [scheduleCustomInput, setScheduleCustomInput] = useState("");

  // Dynamic contrast theme color generator matching or contrasting with user picked --accent color
  useEffect(() => {
    const updateLockdownColor = () => {
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      if (accent && accent.startsWith("#")) {
        const comp = getComplementaryColor(accent);
        document.documentElement.style.setProperty("--lockdown-color", comp.hsl);
        document.documentElement.style.setProperty("--lockdown-color-rgb", comp.rgb);
      } else {
        // Fallback to strike-red
        document.documentElement.style.setProperty("--lockdown-color", "var(--strike-red)");
        document.documentElement.style.setProperty("--lockdown-color-rgb", "232, 115, 108");
      }
    };

    updateLockdownColor();
    
    // Observe style attribute changes on documentElement
    const observer = new MutationObserver(updateLockdownColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  // Sync blocklist from Firestore on first load
  useEffect(() => {
    if (loading || isInitialized) return;

    if (state.blocklist.length > 0) {
      const allPresetItems = new Set(LOCKDOWN_PRESETS.flatMap((p) => p.items.map((i) => i.toLowerCase())));
      const apps = new Set<string>();
      const customs: string[] = [];

      for (const item of state.blocklist) {
        if (allPresetItems.has(item.toLowerCase())) {
          const matched = LOCKDOWN_PRESETS.flatMap((p) => p.items).find((i) => i.toLowerCase() === item.toLowerCase());
          apps.add(matched || item);
        } else {
          customs.push(item);
        }
      }

      setSelectedApps(apps);
      setCustomEntries(customs);
    }
    setIsInitialized(true);
  }, [loading, state.blocklist, isInitialized]);

  // ── Compute full blocklist ─────────────────────────────────────
  const computeBlocklist = (): string[] => {
    const items = new Set<string>([...selectedApps, ...customEntries]);
    return Array.from(items);
  };

  // ── Preset toggle ──────────────────────────────────────────────
  const togglePreset = (presetId: string) => {
    const preset = LOCKDOWN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedApps((prev) => {
      const next = new Set(prev);
      const allSelected = preset.items.every((item) => next.has(item));
      if (allSelected) {
        preset.items.forEach((item) => next.delete(item));
      } else {
        preset.items.forEach((item) => next.add(item));
      }
      return next;
    });
  };

  const toggleExpand = (presetId: string) => {
    setExpandedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  const toggleAppSelection = (item: string) => {
    setSelectedApps((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  };

  // ── Custom entry add/remove ────────────────────────────────────
  const addCustomEntry = () => {
    const trimmed = customInput.trim();
    if (!trimmed || customEntries.some((e) => e.toLowerCase() === trimmed.toLowerCase())) return;
    setCustomEntries((prev) => [...prev, trimmed]);
    setCustomInput("");
  };

  const removeCustomEntry = (entry: string) => {
    setCustomEntries((prev) => prev.filter((e) => e.toLowerCase() !== entry.toLowerCase()));
  };

  const removeBlocklistItem = (item: string) => {
    if (selectedApps.has(item)) {
      setSelectedApps((prev) => {
        const next = new Set(prev);
        next.delete(item);
        return next;
      });
      return;
    }
    removeCustomEntry(item);
  };

  // ── Icon map ───────────────────────────────────────────────────
  const iconMap: Record<string, typeof Gamepad2> = {
    Gamepad2,
    MessageCircle,
    Tv,
    Globe,
    ShoppingBag,
    Newspaper,
  };

  // ── Format time remaining ──────────────────────────────────────
  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── Scheduled Lockdown Helpers & State ──────────────────────────
  const activeSchedules = schedules.filter((s) => {
    if (!s.enabled) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentDay = now.getDay();
    if (!s.days.includes(currentDay)) return false;

    const [startH, startM] = s.startTime.split(":").map(Number);
    const [endH, endM] = s.endTime.split(":").map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (startMin <= endMin) {
      return currentMinutes >= startMin && currentMinutes < endMin;
    } else {
      // Overnight schedule
      return currentMinutes >= startMin || currentMinutes < endMin;
    }
  });

  const isScheduleActive = activeSchedules.length > 0;
  const isAnyLockdownActive = isActive || isScheduleActive;

  const activeScheduledBlocklist = activeSchedules.flatMap((s) => s.blocklist);
  const activeManualBlocklist = isActive ? (state.blocklist ?? []) : [];
  const activeCombinedBlocklist = Array.from(new Set([...activeScheduledBlocklist, ...activeManualBlocklist]));

  const toggleScheduleDay = (day: number) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleAddScheduleCustom = () => {
    const trimmed = scheduleCustomInput.trim();
    if (!trimmed || scheduleCustoms.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
    setScheduleCustoms((prev) => [...prev, trimmed]);
    setScheduleCustomInput("");
  };

  const handleRemoveScheduleCustom = (item: string) => {
    setScheduleCustoms((prev) => prev.filter((c) => c !== item));
  };

  const toggleSchedulePresetGroup = (preset: any) => {
    setScheduleApps((prev) => {
      const allSelected = preset.items.every((item: string) => prev.includes(item));
      if (allSelected) {
        return prev.filter((item) => !preset.items.includes(item));
      } else {
        const combined = [...prev, ...preset.items];
        return Array.from(new Set(combined));
      }
    });
  };

  const toggleSchedulePresetExpand = (presetId: string) => {
    setExpandedSchedulePresets((prev) => {
      const next = new Set(prev);
      if (next.has(presetId)) {
        next.delete(presetId);
      } else {
        next.add(presetId);
      }
      return next;
    });
  };

  const toggleScheduleApp = (item: string) => {
    setScheduleApps((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
  };

  const handleSaveSchedule = async () => {
    if (!scheduleName.trim()) return;

    // Combine preset items and custom items
    const blocklist = Array.from(new Set([...scheduleApps, ...scheduleCustoms]));

    const newSchedule = {
      id: Math.random().toString(36).substring(2, 9),
      name: scheduleName.trim(),
      enabled: true,
      startTime: scheduleStartTime,
      endTime: scheduleEndTime,
      days: scheduleDays,
      blocklist: blocklist,
    };

    const nextSchedules = [...schedules, newSchedule];
    await saveSchedules(nextSchedules);

    // Reset form
    setShowScheduleForm(false);
    setScheduleName("");
    setScheduleStartTime("09:00");
    setScheduleEndTime("17:00");
    setScheduleDays([1, 2, 3, 4, 5]);
    setScheduleApps([]);
    setScheduleCustoms([]);
    setExpandedSchedulePresets(new Set());
  };

  const handleDeleteSchedule = async (id: string) => {
    const nextSchedules = schedules.filter((s) => s.id !== id);
    await saveSchedules(nextSchedules);
  };

  const handleToggleScheduleEnabled = async (id: string) => {
    const nextSchedules = schedules.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    await saveSchedules(nextSchedules);
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

  return (
    <div className="lockdown-page">
      <div className="lockdown-page__header">
        <h1 className="lockdown-page__title t-display">[ SYSTEM LOCKDOWN ]</h1>
        <p className="lockdown-page__subtitle t-meta">ISOLATE DISTRACTIONS • SECURE PRODUCTIVITY GRID</p>
      </div>

      <div className="lockdown-page__content">
        {isAnyLockdownActive ? (
          /* ── ACTIVE STATE: TWO-COLUMN GRID ── */
          <>
            {/* Column 1: Active Shield Status */}
            <div className="lockdown-column lockdown-column--control">
              <div className="lockdown-section" id="lockdown-status">
                <div className="lockdown-section__content">
                  <div className="lockdown-hero">
                    <LockdownLogo isActive={isAnyLockdownActive} size={160} />
                    <div className="lockdown-hero__status">
                      {isActive ? (
                        <span className="lockdown-hero__badge lockdown-hero__badge--active">
                          <Shield size={12} /> LOCKDOWN ACTIVE
                        </span>
                      ) : (
                        <span className="lockdown-hero__badge lockdown-hero__badge--schedule">
                          <Shield size={12} /> SCHEDULE ENFORCED
                        </span>
                      )}
                    </div>

                    {isActive ? (
                      timeRemaining !== null ? (
                        <>
                          <div className="lockdown-hero__timer t-display">
                            {formatTime(timeRemaining)}
                          </div>
                          <div className="lockdown-hero__timer-label t-meta">
                            TIME REMAINING
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="lockdown-hero__timer t-display" style={{ fontSize: 18 }}>
                            ∞
                          </div>
                          <div className="lockdown-hero__timer-label t-meta">
                            UNTIL YOU STOP
                          </div>
                        </>
                      )
                    ) : (
                      <>
                        <div className="lockdown-hero__timer t-display" style={{ fontSize: 22, letterSpacing: "1px", margin: "16px 0 8px 0" }}>
                          {activeSchedules[0]?.name.toUpperCase() || "SCHEDULE"}
                        </div>
                        <div className="lockdown-hero__timer-label t-meta">
                          ACTIVE TIME: {activeSchedules[0]?.startTime} - {activeSchedules[0]?.endTime}
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
                        className="lockdown-activate-btn lockdown-activate-btn--disabled"
                        disabled
                        style={{ cursor: "not-allowed", opacity: 0.6 }}
                      >
                        <Lock size={14} />
                        AUTOPILOT ENFORCED
                      </button>
                    )}
                  </div>

                  {/* Stats */}
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
                      <span className="lockdown-stat__value">{activeCombinedBlocklist.length}</span>
                      <span className="lockdown-stat__label">BLOCKED APPS</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Telemetry & Targets */}
            <div className="lockdown-column lockdown-column--telemetry">
              {/* Actively Blocked Targets Grid */}
              <div className="lockdown-section" id="lockdown-blocked-targets">
                <h2 className="lockdown-section__header t-label">[ BLOCKED TARGETS ]</h2>
                <div className="lockdown-section__content">
                  <div className="blocked-targets-grid">
                    {activeCombinedBlocklist.length > 0 ? (
                      activeCombinedBlocklist.map((target) => {
                        const TargetIcon = getAppIcon(target);
                        return (
                          <div key={target} className="blocked-target-cell">
                            <div className="blocked-target-indicator"></div>
                            <TargetIcon size={12} className="blocked-target-icon" />
                            <span className="blocked-target-name">{target}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="blocked-targets-empty t-meta">NO TARGETS ACTIVE</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shield Telemetry */}
              <div className="lockdown-section" id="lockdown-telemetry">
                <h2 className="lockdown-section__header t-label">[ SHIELD TELEMETRY ]</h2>
                <div className="lockdown-section__content">
                  <div className="telemetry-deck">
                    <div className="telemetry-visual">
                      <div className="telemetry-radar">
                        <div className="telemetry-radar__circle"></div>
                        <div className="telemetry-radar__sweep"></div>
                        <div className="telemetry-radar__grid"></div>
                        <div className="telemetry-radar__ping"></div>
                      </div>
                      <div className="telemetry-diagnostics">
                        <div className="telemetry-diagnostic-row">
                          <span className="telemetry-diagnostic-label">DEFENSE GRID</span>
                          <span className="telemetry-diagnostic-value telemetry-diagnostic-value--green">SECURE</span>
                        </div>
                        <div className="telemetry-diagnostic-row">
                          <span className="telemetry-diagnostic-label">CORE REACTOR</span>
                          <span className="telemetry-diagnostic-value telemetry-diagnostic-value--pulse">STABLE</span>
                        </div>
                        <div className="telemetry-diagnostic-row">
                          <span className="telemetry-diagnostic-label">BYPASS HAZARD</span>
                          <span className="telemetry-diagnostic-value">0%</span>
                        </div>
                        <div className="telemetry-diagnostic-row">
                          <span className="telemetry-diagnostic-label">SHIELD STRENGTH</span>
                          <span className="telemetry-diagnostic-value" style={{ color: "var(--accent)" }}>100%</span>
                        </div>
                      </div>
                    </div>

                    <div className="telemetry-terminal">
                      <div className="telemetry-terminal__line">
                        <span className="telemetry-terminal__prompt">$</span> systemctl status lockdown.service
                      </div>
                      <div className="telemetry-terminal__line">
                        <span className="telemetry-terminal__timestamp">[SEC_OK]</span> Core engine running on PID 8490
                      </div>
                      <div className="telemetry-terminal__line">
                        <span className="telemetry-terminal__timestamp">[SEC_OK]</span> Arming defense grids for {activeCombinedBlocklist.length} systems
                      </div>
                      {activeCombinedBlocklist.slice(0, 3).map((app) => (
                        <div key={app} className="telemetry-terminal__line telemetry-terminal__line--dim">
                          <span className="telemetry-terminal__timestamp">[SHIELD]</span> Activating hook block :: {app.toUpperCase()}
                        </div>
                      ))}
                      {activeCombinedBlocklist.length > 3 && (
                        <div className="telemetry-terminal__line telemetry-terminal__line--dim">
                          <span className="telemetry-terminal__timestamp">[SHIELD]</span> ... and {activeCombinedBlocklist.length - 3} other target processes
                        </div>
                      )}
                      <div className="telemetry-terminal__line telemetry-terminal__line--success">
                        <span className="telemetry-terminal__timestamp">[SECURE]</span> Focus lock engaged. External intrusions restricted.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Violations */}
              {state.violations && state.violations.length > 0 && (
                <div className="lockdown-section" id="lockdown-violations">
                  <h2 className="lockdown-section__header t-label">[ RECENT VIOLATIONS ]</h2>
                  <div className="lockdown-section__content">
                    <div className="lockdown-violations-list">
                      {state.violations
                        .slice(-6)
                        .reverse()
                        .map((v, i) => (
                          <div key={i} className="lockdown-row">
                            <div className="lockdown-row__label">
                              <Lock size={12} style={{ color: "var(--lockdown-color)" }} />
                              <span className="t-body">{v.matchedRule || v.appName}</span>
                            </div>
                            <span className="t-meta" style={{ color: "var(--text-muted)", fontSize: 10 }}>
                              {new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ── INACTIVE STATE: TWO-COLUMN GRID ── */
          <>
            {/* Column 1: Lockdown Configuration */}
            <div className="lockdown-column lockdown-column--control">
              <div className="lockdown-section" id="lockdown-status">
                <div className="lockdown-section__content">
                  <div className="lockdown-hero">
                    <LockdownLogo isActive={isActive} size={160} />
                    <div className="lockdown-hero__status">
                      <span className="lockdown-hero__badge lockdown-hero__badge--inactive">
                        <ShieldOff size={12} /> LOCKDOWN INACTIVE
                      </span>
                    </div>

                    <button
                      className="lockdown-activate-btn lockdown-activate-btn--start"
                      onClick={handleActivate}
                      disabled={fullBlocklist.length === 0}
                      title={fullBlocklist.length === 0 ? "Select at least one app to block" : ""}
                    >
                      <Shield size={14} />
                      ACTIVATE LOCKDOWN
                    </button>

                    {/* Duration picker */}
                    <div className="lockdown-duration-section">
                      <div className="lockdown-section-subheading t-meta">SELECT SESSION TIMEOUT</div>
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
                    </div>
                  </div>

                  {/* Stats */}
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

              {/* Scheduled Lockdowns Section */}
              <div className="lockdown-section" id="lockdown-schedules" style={{ marginTop: "24px" }}>
                <h2 className="lockdown-section__header t-label">[ SCHEDULED LOCKDOWNS ]</h2>
                <div className="lockdown-section__content">
                  {/* Create New Schedule Button */}
                  {!showScheduleForm && (
                    <button
                      className="lockdown-schedule-create-btn"
                      onClick={() => setShowScheduleForm(true)}
                    >
                      <Plus size={12} />
                      <span>CREATE NEW SCHEDULE</span>
                    </button>
                  )}

                  {/* Creation Form */}
                  {showScheduleForm && (
                    <div className="lockdown-schedule-form" style={{ padding: "16px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "12px", marginBottom: "16px" }}>
                      <div className="lockdown-section-subheading t-meta" style={{ marginBottom: "6px" }}>SCHEDULE NAME</div>
                      <input
                        className="lockdown-custom__input"
                        style={{ marginBottom: "12px", width: "100%" }}
                        type="text"
                        placeholder="e.g. Morning Focus, Deep Work"
                        value={scheduleName}
                        onChange={(e) => setScheduleName(e.target.value)}
                      />

                      <div className="lockdown-schedule-form__row" style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
                        <div style={{ flex: 1 }}>
                          <div className="lockdown-section-subheading t-meta" style={{ marginBottom: "6px" }}>START TIME</div>
                          <TimeInput
                            value={scheduleStartTime}
                            onChange={setScheduleStartTime}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="lockdown-section-subheading t-meta" style={{ marginBottom: "6px" }}>END TIME</div>
                          <TimeInput
                            value={scheduleEndTime}
                            onChange={setScheduleEndTime}
                          />
                        </div>
                      </div>

                      <div className="lockdown-section-subheading t-meta" style={{ marginBottom: "6px" }}>REPEAT DAYS</div>
                      <div className="lockdown-days-selector" style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                        {["S", "M", "T", "W", "T", "F", "S"].map((dayName, idx) => {
                          const active = scheduleDays.includes(idx);
                          return (
                            <button
                              key={idx}
                              className={`lockdown-day-chip${active ? " lockdown-day-chip--active" : ""}`}
                              onClick={() => toggleScheduleDay(idx)}
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                background: active ? "var(--lockdown-color, var(--strike-red))" : "rgba(255, 255, 255, 0.03)",
                                color: active ? "#000" : "#fff",
                                fontWeight: "bold",
                                cursor: "pointer",
                                transition: "all 0.2s ease"
                              }}
                            >
                              {dayName}
                            </button>
                          );
                        })}
                      </div>

                      <div className="lockdown-section-subheading t-meta" style={{ marginBottom: "6px" }}>BLOCK PRESETS & APPS</div>
                      <div className="lockdown-schedule-presets-container" style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                        {LOCKDOWN_PRESETS.map((p) => {
                          const IconComponent = iconMap[p.icon] || Globe;
                          const allSelected = p.items.every((item) => scheduleApps.includes(item));
                          const someSelected = p.items.some((item) => scheduleApps.includes(item));
                          const expanded = expandedSchedulePresets.has(p.id);
                          return (
                            <div key={p.id} className="lockdown-schedule-preset-item" style={{ border: "1px solid rgba(255,255,255,0.05)", borderRadius: "6px", overflow: "hidden" }}>
                              <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.01)" }}>
                                <div
                                  onClick={() => toggleSchedulePresetGroup(p)}
                                  style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", cursor: "pointer" }}
                                >
                                  <IconComponent size={14} className="lockdown-preset__icon" style={{ color: someSelected ? "var(--lockdown-color)" : "var(--text-secondary)" }} />
                                  <div style={{ display: "flex", flexDirection: "column" }}>
                                    <span style={{ fontSize: "10px", fontFamily: "Departure Mono, monospace", letterSpacing: "1px", color: "var(--text-primary)" }}>{p.label}</span>
                                    <span className="t-meta" style={{ fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.5px" }}>{p.items.length} APPS</span>
                                  </div>
                                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", color: "var(--lockdown-color)" }}>
                                    {allSelected && <Check size={12} />}
                                    {!allSelected && someSelected && <Minus size={12} />}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleSchedulePresetExpand(p.id)}
                                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center" }}
                                >
                                  <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.25s ease" }} />
                                </button>
                              </div>
                              {expanded && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "10px", background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                                  {p.items.map((item) => {
                                    const active = scheduleApps.includes(item);
                                    return (
                                      <button
                                        key={item}
                                        type="button"
                                        onClick={() => toggleScheduleApp(item)}
                                        style={{
                                          padding: "3px 6px",
                                          borderRadius: "4px",
                                          border: active ? "1px solid rgba(var(--lockdown-color-rgb), 0.3)" : "1px solid rgba(255,255,255,0.05)",
                                          background: active ? "rgba(var(--lockdown-color-rgb), 0.08)" : "rgba(255,255,255,0.01)",
                                          color: active ? "var(--lockdown-color)" : "var(--text-secondary)",
                                          fontFamily: "Departure Mono, monospace",
                                          fontSize: "8px",
                                          letterSpacing: "0.5px",
                                          cursor: "pointer",
                                          transition: "all 0.15s ease"
                                        }}
                                      >
                                        {item}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="lockdown-section-subheading t-meta" style={{ marginBottom: "6px" }}>CUSTOM APPS TO BLOCK</div>
                      <div className="lockdown-custom__input-row" style={{ marginBottom: "12px" }}>
                        <input
                          className="lockdown-custom__input"
                          type="text"
                          placeholder="e.g. steam.exe, chrome.exe"
                          value={scheduleCustomInput}
                          onChange={(e) => setScheduleCustomInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddScheduleCustom()}
                        />
                        <button className="lockdown-custom__add-btn" onClick={handleAddScheduleCustom}>
                          + ADD
                        </button>
                      </div>

                      {scheduleCustoms.length > 0 && (
                        <div className="lockdown-tags" style={{ marginBottom: "16px" }}>
                          {scheduleCustoms.map((c) => (
                            <span key={c} className="lockdown-tag">
                              <span className="lockdown-tag__name">{c}</span>
                              <button className="lockdown-tag__remove" onClick={() => handleRemoveScheduleCustom(c)}>
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="lockdown-schedule-form-actions" style={{ display: "flex", gap: "12px" }}>
                        <button
                          className="lockdown-activate-btn lockdown-activate-btn--start"
                          onClick={handleSaveSchedule}
                          disabled={!scheduleName.trim() || (scheduleApps.length === 0 && scheduleCustoms.length === 0)}
                        >
                          SAVE SCHEDULE
                        </button>
                        <button
                          className="lockdown-activate-btn lockdown-activate-btn--stop"
                          onClick={() => setShowScheduleForm(false)}
                          style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Schedules List */}
                  <div className="lockdown-schedules-list" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {schedules.map((s) => {
                      const active = activeSchedules.some((a) => a.id === s.id);
                      return (
                        <div
                          key={s.id}
                          className="lockdown-schedule-card"
                          style={{
                            padding: "16px",
                            borderRadius: "12px",
                            background: "rgba(255, 255, 255, 0.02)",
                            border: active ? "1px solid var(--lockdown-color, var(--strike-red))" : "1px solid rgba(255, 255, 255, 0.05)",
                            boxShadow: active ? "0 0 15px rgba(232, 115, 108, 0.15)" : "none",
                            transition: "all 0.3s ease"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontWeight: "bold", fontSize: "14px", letterSpacing: "0.5px" }}>{s.name.toUpperCase()}</span>
                                {active && (
                                  <span
                                    style={{
                                      fontSize: "9px",
                                      background: "var(--lockdown-color, var(--strike-red))",
                                      color: "#000",
                                      fontWeight: "bold",
                                      padding: "2px 6px",
                                      borderRadius: "10px"
                                    }}
                                  >
                                    ACTIVE
                                  </span>
                                )}
                              </div>
                              <span className="t-meta" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                                {s.startTime} - {s.endTime}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              {/* Enable/Disable Toggle */}
                              <button
                                onClick={() => handleToggleScheduleEnabled(s.id)}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  background: s.enabled ? "rgba(232, 115, 108, 0.15)" : "rgba(255,255,255,0.03)",
                                  color: s.enabled ? "var(--lockdown-color, var(--strike-red))" : "var(--text-muted)",
                                  fontSize: "10px",
                                  fontWeight: "bold",
                                  cursor: "pointer"
                                }}
                              >
                                {s.enabled ? "ENABLED" : "DISABLED"}
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={() => handleDeleteSchedule(s.id)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "rgba(255,255,255,0.3)",
                                  cursor: "pointer"
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            {/* Days indicators */}
                            <div style={{ display: "flex", gap: "4px" }}>
                              {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => {
                                const activeDay = s.days.includes(idx);
                                return (
                                  <span
                                    key={idx}
                                    style={{
                                      fontSize: "9px",
                                      fontWeight: "bold",
                                      color: activeDay ? "var(--lockdown-color, var(--strike-red))" : "rgba(255,255,255,0.15)"
                                    }}
                                  >
                                    {d}
                                  </span>
                                );
                              })}
                            </div>

                            <span className="t-meta" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                              {s.blocklist.length} TARGET APPS
                            </span>
                          </div>

                          {s.blocklist.length > 0 && (
                            <div style={{ marginTop: "8px", fontSize: "9px", color: "rgba(255,255,255,0.3)", fontFamily: "Departure Mono, monospace", borderTop: "1px dashed rgba(255,255,255,0.05)", paddingTop: "6px", wordBreak: "break-all", textAlign: "left" }}>
                              BLOCKED: {s.blocklist.slice(0, 5).join(", ")}{s.blocklist.length > 5 ? `, +${s.blocklist.length - 5} more` : ""}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {schedules.length === 0 && !showScheduleForm && (
                      <div className="t-meta" style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted)" }}>
                        NO SCHEDULED LOCKDOWNS CONFIGURED
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Presets & Custom inputs */}
            <div className="lockdown-column lockdown-column--config">
              <div className="lockdown-section" id="lockdown-blocklist">
                <h2 className="lockdown-section__header t-label">[ BLOCKLIST PRESETS ]</h2>
                <div className="lockdown-section__content">
                  <div className="lockdown-presets">
                    {LOCKDOWN_PRESETS.map((preset) => {
                      const IconComponent = iconMap[preset.icon] || Globe;
                      const allSelected = preset.items.every((item) => selectedApps.has(item));
                      const someSelected = preset.items.some((item) => selectedApps.has(item));
                      const expanded = expandedPresets.has(preset.id);
                      return (
                        <div
                          key={preset.id}
                          className={`lockdown-preset-container ${expanded ? "expanded" : ""}`}
                        >
                          <div className={`lockdown-preset${someSelected ? " lockdown-preset--active" : ""}`}>
                            <div className="lockdown-preset__main" onClick={() => togglePreset(preset.id)}>
                              <IconComponent size={18} className="lockdown-preset__icon" />
                              <div className="lockdown-preset__info">
                                <span className="lockdown-preset__name">{preset.label}</span>
                                <span className="lockdown-preset__count t-meta">
                                  {preset.items.length} APPS
                                </span>
                              </div>
                              <span className="lockdown-preset__check">
                                {allSelected && <Check size={14} />}
                                {!allSelected && someSelected && <Minus size={14} />}
                              </span>
                            </div>
                            
                            <button
                              type="button"
                              className="lockdown-preset__expand-btn"
                              onClick={() => toggleExpand(preset.id)}
                            >
                              <ChevronDown size={14} className={`chevron-icon ${expanded ? "rotated" : ""}`} />
                            </button>
                          </div>

                          {expanded && (
                            <div className="lockdown-preset__apps-list">
                              {preset.items.map((item) => {
                                const itemActive = selectedApps.has(item);
                                return (
                                  <button
                                    key={item}
                                    type="button"
                                    className={`lockdown-preset__app-pill ${itemActive ? "active" : ""}`}
                                    onClick={() => toggleAppSelection(item)}
                                  >
                                    {item}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom entries */}
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

                  {/* Current blocklist as tags */}
                  {fullBlocklist.length > 0 && (
                    <div className="lockdown-tags-container">
                      <div className="lockdown-section-subheading t-meta">ACTIVE TARGETS TO BLOCK ({fullBlocklist.length})</div>
                      <div className="lockdown-tags">
                        {fullBlocklist.map((item) => {
                          const AppIcon = getAppIcon(item);
                          return (
                            <span key={item} className="lockdown-tag">
                              <AppIcon size={12} className="lockdown-tag__icon" />
                              <span className="lockdown-tag__name">{item}</span>
                              <button
                                className="lockdown-tag__remove"
                                onClick={() => removeBlocklistItem(item)}
                              >
                                <X size={10} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Violations History */}
              {state.violations && state.violations.length > 0 && (
                <div className="lockdown-section" id="lockdown-violations">
                  <h2 className="lockdown-section__header t-label">[ RECENT VIOLATIONS ]</h2>
                  <div className="lockdown-section__content">
                    <div className="lockdown-violations-list">
                      {state.violations
                        .slice(-6)
                        .reverse()
                        .map((v, i) => (
                          <div key={i} className="lockdown-row">
                            <div className="lockdown-row__label">
                              <Lock size={12} style={{ color: "var(--lockdown-color)" }} />
                              <span className="t-body">{v.matchedRule || v.appName}</span>
                            </div>
                            <span className="t-meta" style={{ color: "var(--text-muted)", fontSize: 10 }}>
                              {new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

