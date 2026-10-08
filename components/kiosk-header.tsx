import { ArrowLeft, LogIn, Search, ShoppingBag, X } from "lucide-react";
import { BrandLogo } from "./brand-logo";

type HeaderProps = {
  shopName: string;
  cartUnits: number;
  maxUnits: number;
  online: boolean;
  searchValue?: string;
  showSearch?: boolean;
  onSearchChange?: (value: string) => void;
  onCart: () => void;
  onSettings: () => void;
  onBack?: () => void;
};

export function KioskHeader({
  shopName,
  cartUnits,
  maxUnits,
  online,
  searchValue = "",
  showSearch = false,
  onSearchChange,
  onCart,
  onSettings,
  onBack,
}: HeaderProps) {
  return (
    <header className={`kiosk-header ${showSearch ? "kiosk-header--with-search" : ""}`}>
      <div className="kiosk-header__brand-wrap">
        {onBack ? (
          <button className="icon-button" onClick={onBack} aria-label="Go back">
            <ArrowLeft size={22} />
          </button>
        ) : null}
        <BrandLogo compact strapline />
        <span className="kiosk-header__store-name">{shopName}</span>
      </div>

      {showSearch ? (
        <label className="header-search">
          <Search size={21} aria-hidden="true" />
          <span className="sr-only">Search gifts</span>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Search gifts, occasions or recipients"
          />
          {searchValue ? (
            <button
              className="header-search__clear"
              type="button"
              onClick={() => onSearchChange?.("")}
              aria-label="Clear search"
            >
              <X size={17} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      ) : (
        <div className="kiosk-header__spacer" />
      )}

      <div className="kiosk-header__actions">
        <span className={online ? "network online" : "network offline"}>
          <span className="network__dot" aria-hidden="true" />
          <span>{online ? "Online" : "Offline"}</span>
        </span>
        <span className="kiosk-header__divider" aria-hidden="true" />
        <button
          className="cart-header-button"
          onClick={onCart}
          aria-label={`Open cart, ${cartUnits} of ${maxUnits} gifts selected`}
        >
          <ShoppingBag size={21} aria-hidden="true" />
          <span className="cart-header-button__count">{cartUnits}</span>
          <span className="cart-header-button__label">
            {cartUnits} of {maxUnits}
          </span>
        </button>
        <span className="kiosk-header__divider" aria-hidden="true" />
        <button className="kiosk-vendor-access" onClick={onSettings} aria-label="Vendor login">
          <LogIn size={19} aria-hidden="true" />
          <span>Vendor login</span>
        </button>
      </div>
    </header>
  );
}
