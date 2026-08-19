import { Check } from "lucide-react";

const steps = ["Cart", "Details", "Review", "Send on WhatsApp"] as const;

export function CheckoutStepper({ active }: { active: 1 | 2 | 3 | 4 }) {
  return (
    <nav className="checkout-stepper" aria-label="Checkout progress">
      {steps.map((step, index) => {
        const number = index + 1;
        const state = number === active ? "active" : number < active ? "done" : "";
        return (
          <div className={`checkout-step ${state}`} key={step} aria-current={number === active ? "step" : undefined}>
            <span className="checkout-step__number">
              {number < active ? <Check size={15} strokeWidth={2.4} /> : number}
            </span>
            <span>{step}</span>
          </div>
        );
      })}
    </nav>
  );
}
