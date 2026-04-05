import { useState } from "react";
import { PunishmentChoice, PUNISHMENT_OPTIONS } from "../types";
import { LucideIcon } from "../../../shared/components/IconPicker/LucideIcon";
import "./PunishmentModal.css";

interface PunishmentModalProps {
  onConfirm: (choice: PunishmentChoice) => void;
  onCancel: () => void;
}

export function PunishmentModal({ onConfirm, onCancel }: PunishmentModalProps) {
  const [selected, setSelected] = useState<PunishmentChoice | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirming(true);
    onConfirm(selected);
  };

  return (
    <div className="punishment-overlay" onClick={onCancel}>
      <div className="punishment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="punishment-modal__header">
          <h2 className="t-h2">[ CHOOSE YOUR PENANCE ]</h2>
          <p className="t-body" style={{ color: "var(--text-muted)", marginTop: 8 }}>
            Select one option to resolve your lockout and reset strikes to 0.
          </p>
        </div>

        <div className="punishment-modal__options">
          {PUNISHMENT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`punishment-card ${selected === opt.id ? "punishment-card--selected" : ""}`}
              onClick={() => setSelected(opt.id)}
            >
              <div className="punishment-card__icon">
                <LucideIcon name={opt.icon} size={24} />
              </div>
              <div className="punishment-card__text">
                <span className="t-label">{opt.title}</span>
                <span className="t-meta" style={{ color: "var(--text-muted)", marginTop: 4 }}>
                  {opt.description}
                </span>
              </div>
              {selected === opt.id && (
                <div className="punishment-card__check">
                  <LucideIcon name="Check" size={16} />
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="punishment-modal__footer">
          <button className="t-label punishment-modal__cancel" onClick={onCancel}>
            [ CANCEL ]
          </button>
          <button
            className="t-label punishment-modal__confirm"
            onClick={handleConfirm}
            disabled={!selected || confirming}
          >
            {confirming ? "RESOLVING..." : "[ CONFIRM ]"}
          </button>
        </div>
      </div>
    </div>
  );
}
