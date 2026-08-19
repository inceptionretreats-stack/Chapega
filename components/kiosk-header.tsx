import {
  ArrowLeft,
  Search,
  Settings,
  ShoppingBag,
  Wifi,
  WifiOff,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";

type HeaderProps = {
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
    <header className="kiosk-header">
      <div className="kiosk-header__brand-wrap">
        {onBack ? (
          <button className="icon-button" onClick={onBack} aria-label="Go back">
            <ArrowLeft size={22} />
          </button>
        ) : null}
        <BrandLogo compact />
      </div>

      {showSearch ? (
        <label className="header-search">
          <Search size={21} aria-hidden="true" />
          <span className="sr-only">Search gifts</span>
          <input
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Search gifts, occasions or recipients"
          />
        </label>
      ) : (
        <div className="kiosk-header__spacer" />
      )}

      <div className="kiosk-header__actions">
        <span className={online ? "network online" : "network offline"}>
          {online ? <Wifi size={17} /> : <WifiOff size={17} />}
          <span>{online ? "Online" : "Offline"}</span>
        </span>
        <button className="cart-header-button" onClick={onCart} aria-label="Open cart">
          <ShoppingBag size={21} />
          <span>{cartUnits} of {maxUnits}</span>
        </button>
        <button className="icon-button" onClick={onSettings} aria-label="Presenter settings">
          <Settings size={22} />
        </button>
      </div>
    </header>
  );
}
