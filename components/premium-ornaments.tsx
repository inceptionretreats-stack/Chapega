import type { ReactNode } from "react";

export function HeartDoodle({ className = "" }: { className?: string }) {
  return (
    <svg className={`heart-doodle ${className}`} viewBox="0 0 82 96" aria-hidden="true">
      <path d="M40 86C30 66 8 49 9 25 10 8 30 7 40 28 50 4 73 7 73 27 73 49 53 67 40 86Z" />
      <path d="M39 86C35 91 32 94 28 96" />
    </svg>
  );
}

export function BowMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`bow-mark ${className}`} viewBox="0 0 92 38" aria-hidden="true">
      <path d="M45 28C35 12 24 5 15 8 6 12 12 24 45 28Z" />
      <path d="M47 28C57 12 68 5 77 8 86 12 80 24 47 28Z" />
      <path d="M46 27V6M21 32H72" />
    </svg>
  );
}

export function RibbonPath({ className = "" }: { className?: string }) {
  return (
    <svg className={`ribbon-path ${className}`} viewBox="0 0 1200 118" preserveAspectRatio="none" aria-hidden="true">
      <path className="ribbon-path__burgundy" d="M5 62C72 62 90 22 157 43S243 115 330 67 429 27 493 68 606 111 671 60 774 23 839 67 956 111 1019 59 1130 24 1195 62" />
      <path className="ribbon-path__gold" d="M265 52c12-24 34-23 35-5 0 14-18 26-35 42-17-16-35-28-35-42 1-18 23-19 35 5Zm601 8c9-18 26-18 27-4 0 11-14 20-27 32-13-12-27-21-27-32 1-14 18-14 27 4Z" />
    </svg>
  );
}

export function BotanicalSprig({ className = "" }: { className?: string }) {
  return (
    <svg className={`botanical-sprig ${className}`} viewBox="0 0 130 240" aria-hidden="true">
      <path d="M24 229C37 178 48 123 90 35M45 158C25 146 18 124 22 98 45 109 54 128 45 158ZM62 113C52 88 61 65 83 47 93 70 87 94 62 113ZM79 76C78 51 94 30 116 20 119 45 104 67 79 76ZM36 186C16 181 6 167 5 146 25 149 38 163 36 186Z" />
    </svg>
  );
}

export function HandNote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`hand-note ${className}`} aria-hidden="true">{children}</span>;
}

export function MicroStamp({ lines, className = "" }: { lines: readonly string[]; className?: string }) {
  return (
    <span className={`micro-stamp ${className}`} aria-hidden="true">
      {lines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
    </span>
  );
}
