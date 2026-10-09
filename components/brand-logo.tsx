export const BRAND_NAME = "Chapega.com";

/** True when a shop's name is just the brand name the logo already shows. */
export function isBrandName(name: string): boolean {
  return name.trim().toLowerCase() === BRAND_NAME.toLowerCase();
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-logo${compact ? " brand-logo--compact" : ""}`} aria-label="Chapega.com">
      <span className={compact ? "brand-logo__text compact" : "brand-logo__text"}>
        Chapega<span className="brand-logo__domain">.com</span>
      </span>
    </div>
  );
}
