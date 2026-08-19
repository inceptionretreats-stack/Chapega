import { Gift } from "lucide-react";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-logo" aria-label="Chapega.com">
      <span className="brand-logo__mark" aria-hidden="true">
        <Gift size={compact ? 25 : 31} strokeWidth={1.75} />
      </span>
      <span className={compact ? "brand-logo__text compact" : "brand-logo__text"}>
        Chapega.com
      </span>
    </div>
  );
}
