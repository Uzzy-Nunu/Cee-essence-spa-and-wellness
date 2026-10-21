import React from "react";

interface LogoProps {
  className?: string;
  variant?: "light" | "dark" | "gold";
  size?: "sm" | "md" | "lg";
}

/**
 * The authentic Cee Essence Spa & Wellness logo without circular background.
 * Matches the official branding:
 * - "CEE ESSENCE" in elegant serif capitals
 * - Divider line with centered botanical twin-leaves motif
 * - "SPA & WELLNESS" in spaced subtext
 */
export function CeeEssenceLogo({ className = "", variant = "light", size = "md" }: LogoProps) {
  const colorMap = {
    light: "#f4ecdc",
    dark: "#2f3d27",
    gold: "#c9a463",
  };

  const primaryColor = colorMap[variant] || "currentColor";
  const accentColor = variant === "light" ? "#c9a463" : variant === "dark" ? "#506342" : "#35432b";

  // Sizing configurations
  const dimensions = {
    sm: { width: 140, height: 42, fontSizeMain: 14, fontSizeSub: 5.5 },
    md: { width: 185, height: 56, fontSizeMain: 18, fontSizeSub: 6.8 },
    lg: { width: 230, height: 70, fontSizeMain: 22, fontSizeSub: 8.2 },
  };

  const dim = dimensions[size] || dimensions.md;

  return (
    <div className={`cee-essence-logo ${className}`} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <svg
        viewBox="0 0 200 60"
        width={dim.width}
        height={dim.height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Cee Essence Spa & Wellness Logo"
        role="img"
      >
        {/* Main Title: CEE ESSENCE */}
        <text
          x="100"
          y="24"
          textAnchor="middle"
          fill={primaryColor}
          style={{
            fontFamily: "'Cormorant Garamond', 'Didot', 'Bodoni MT', Georgia, serif",
            fontSize: "20px",
            fontWeight: 500,
            letterSpacing: "0.26em",
          }}
        >
          CEE ESSENCE
        </text>

        {/* Left divider line */}
        <line
          x1="22"
          y1="34"
          x2="84"
          y2="34"
          stroke={accentColor}
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Center Botanical Twin Leaves Motif */}
        <g transform="translate(100, 34)" stroke={accentColor} fill={accentColor}>
          {/* Left Leaf */}
          <path
            d="M-0.5,1.5 C-4.5,-0.5 -8.5,-5.5 -7.5,-10 C-3,-9.5 -0.5,-5 -0.5,1.5 Z"
            strokeWidth="0.6"
            strokeLinejoin="round"
            opacity="0.95"
          />
          {/* Right Leaf */}
          <path
            d="M0.5,1.5 C4.5,-0.5 8.5,-5.5 7.5,-10 C3,-9.5 0.5,-5 0.5,1.5 Z"
            strokeWidth="0.6"
            strokeLinejoin="round"
            opacity="0.95"
          />
          {/* Subtle central stem accent */}
          <circle cx="0" cy="2" r="0.75" fill={accentColor} />
        </g>

        {/* Right divider line */}
        <line
          x1="116"
          y1="34"
          x2="178"
          y2="34"
          stroke={accentColor}
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Subtitle: SPA & WELLNESS */}
        <text
          x="100"
          y="49"
          textAnchor="middle"
          fill={primaryColor}
          style={{
            fontFamily: "'Inter', -apple-system, sans-serif",
            fontSize: "7px",
            fontWeight: 400,
            letterSpacing: "0.42em",
            opacity: 0.92,
          }}
        >
          SPA &amp; WELLNESS
        </text>
      </svg>
    </div>
  );
}
