export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-logo${compact ? " brand-logo--compact" : ""}`} aria-label="Chapega.com">
      <span className={compact ? "brand-logo__text compact" : "brand-logo__text"}>
        Chapega<span className="brand-logo__domain">.com</span>
      </span>
    </div>
  );
}
