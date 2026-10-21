"use client";

import React, { useId } from "react";

export type WaterStreamVariant =
  | "story-to-treatments"
  | "hero-to-story"
  | "treatments-to-therapists"
  | "therapists-to-booking"
  | "booking-to-footer";

interface WaterStreamProps {
  variant?: WaterStreamVariant;
  className?: string;
}

const GRADIENT_CONFIGS: Record<
  WaterStreamVariant,
  {
    bg: string;
    glowFrom: string;
    back: [string, string, string];
    mid: [string, string, string];
    front: [string, string, string];
  }
> = {
  "hero-to-story": {
    bg: "transparent",
    glowFrom: "rgba(18, 14, 10, 0.4)",
    back: ["rgba(201, 164, 99, 0.15)", "rgba(240, 230, 210, 0.5)", "#fbf7ee"],
    mid: ["rgba(80, 100, 70, 0.15)", "rgba(220, 210, 190, 0.7)", "#fbf7ee"],
    front: ["rgba(180, 165, 140, 0.25)", "rgba(245, 238, 225, 0.85)", "#fbf7ee"],
  },
  "story-to-treatments": {
    bg: "#fbf7ee",
    glowFrom: "rgba(251, 247, 238, 1)",
    back: ["rgba(195, 215, 205, 0.18)", "rgba(130, 160, 140, 0.35)", "#1e241b"],
    mid: ["rgba(201, 164, 99, 0.12)", "rgba(53, 67, 43, 0.45)", "#1e241b"],
    front: ["rgba(160, 185, 170, 0.22)", "rgba(35, 48, 30, 0.75)", "#1e241b"],
  },
  "treatments-to-therapists": {
    bg: "#f4ecdc",
    glowFrom: "rgba(244, 236, 220, 1)",
    back: ["rgba(195, 215, 205, 0.15)", "rgba(100, 125, 90, 0.35)", "#35432b"],
    mid: ["rgba(201, 164, 99, 0.18)", "rgba(70, 88, 60, 0.5)", "#35432b"],
    front: ["rgba(160, 185, 170, 0.22)", "rgba(45, 58, 38, 0.78)", "#35432b"],
  },
  "therapists-to-booking": {
    bg: "#35432b",
    glowFrom: "rgba(53, 67, 43, 0.8)",
    back: ["rgba(201, 164, 99, 0.15)", "rgba(180, 195, 170, 0.4)", "#e9dfcf"],
    mid: ["rgba(140, 160, 130, 0.25)", "rgba(220, 210, 195, 0.65)", "#e9dfcf"],
    front: ["rgba(90, 110, 80, 0.35)", "rgba(233, 223, 207, 0.88)", "#e9dfcf"],
  },
  "booking-to-footer": {
    bg: "#e9dfcf",
    glowFrom: "rgba(233, 223, 207, 1)",
    back: ["rgba(190, 175, 150, 0.2)", "rgba(80, 95, 75, 0.38)", "#181c15"],
    mid: ["rgba(201, 164, 99, 0.16)", "rgba(50, 60, 45, 0.55)", "#181c15"],
    front: ["rgba(150, 140, 125, 0.25)", "rgba(30, 36, 26, 0.82)", "#181c15"],
  },
};

/**
 * WaterStream: A faint, tranquil animated water stream that gracefully cascades
 * between sections. Replicated across all page transitions for a seamless, tranquil sanctuary flow.
 */
export function WaterStream({ variant = "story-to-treatments", className = "" }: WaterStreamProps) {
  const uid = useId().replace(/:/g, "_");
  const cfg = GRADIENT_CONFIGS[variant] || GRADIENT_CONFIGS["story-to-treatments"];

  const gradBackId = `waterGradBack_${uid}`;
  const gradMidId = `waterGradMid_${uid}`;
  const gradFrontId = `waterGradFront_${uid}`;

  return (
    <div
      className={`water-stream-wrapper water-stream-${variant} ${className}`}
      style={{ background: cfg.bg }}
      aria-hidden="true"
    >
      {/* Subtle misty ambient gradient */}
      <div
        className="water-stream-glow"
        style={{
          background: `linear-gradient(180deg, ${cfg.glowFrom} 0%, rgba(255, 255, 255, 0) 100%)`,
        }}
      />

      {/* Layered flowing SVG curves */}
      <div className="water-wave-container">
        {/* Layer 1: Back peaceful wave stream */}
        <svg
          className="water-wave water-wave-back"
          viewBox="0 0 2880 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path
            d="M0,45 C360,10 720,80 1080,45 C1440,10 1800,80 2160,45 C2520,10 2880,80 2880,45 L2880,140 L0,140 Z"
            fill={`url(#${gradBackId})`}
          />
          <defs>
            <linearGradient id={gradBackId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={cfg.back[0]} />
              <stop offset="50%" stopColor={cfg.back[1]} />
              <stop offset="100%" stopColor={cfg.back[2]} />
            </linearGradient>
          </defs>
        </svg>

        {/* Layer 2: Mid shimmering gold/olive-tinted water ripple */}
        <svg
          className="water-wave water-wave-mid"
          viewBox="0 0 2880 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path
            d="M0,70 C400,100 800,20 1200,65 C1600,110 2000,30 2400,70 C2640,90 2880,50 2880,70 L2880,140 L0,140 Z"
            fill={`url(#${gradMidId})`}
          />
          <defs>
            <linearGradient id={gradMidId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={cfg.mid[0]} />
              <stop offset="60%" stopColor={cfg.mid[1]} />
              <stop offset="100%" stopColor={cfg.mid[2]} />
            </linearGradient>
          </defs>
        </svg>

        {/* Layer 3: Foreground deep calm flow leading into next section */}
        <svg
          className="water-wave water-wave-front"
          viewBox="0 0 2880 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path
            d="M0,85 C480,50 960,110 1440,75 C1920,40 2400,100 2880,75 L2880,140 L0,140 Z"
            fill={`url(#${gradFrontId})`}
          />
          <defs>
            <linearGradient id={gradFrontId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={cfg.front[0]} />
              <stop offset="45%" stopColor={cfg.front[1]} />
              <stop offset="100%" stopColor={cfg.front[2]} />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
