import React from "react";
import * as LucideIcons from "lucide-react";
import { InsightCard } from "../types";
import "./SmartInsightCard.css";

interface Props {
  insight: InsightCard;
}

export const SmartInsightCard: React.FC<Props> = ({ insight }) => {
  const Icon = LucideIcons[insight.icon as keyof typeof LucideIcons] as React.ElementType || LucideIcons.Activity;

  return (
    <div className="smart-insight-card" style={{ '--insight-color': insight.color || 'var(--text-primary)' } as any}>
      <div className="sic-header">
        <span className="t-meta sic-title">[{insight.title}]</span>
        <Icon size={16} className="sic-icon" />
      </div>
      <div className="sic-body">
        <div className="t-body sic-value">{insight.value}</div>
        <div className="t-meta sic-sub">{insight.subValue}</div>
      </div>
    </div>
  );
};
