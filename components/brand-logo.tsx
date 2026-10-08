export function BrandLogo({
  compact = false,
  strapline = false,
}: {
  compact?: boolean;
  strapline?: boolean;
}) {
  return (
    <div className={`brand-logo${compact ? " brand-logo--compact" : ""}`} aria-label="Chapega.com">
      <span className={compact ? "brand-logo__text compact" : "brand-logo__text"}>
        Chapega<span className="brand-logo__domain">.com</span>
      </span>
      {strapline ? (
        <span className="brand-logo__descriptor" aria-hidden="true">
          <span className="brand-logo__divider" />
          <span className="brand-logo__strapline">
            Thoughtful gifts
            <br />
            for every moment
          </span>
        </span>
      ) : null}
    </div>
  );
}
