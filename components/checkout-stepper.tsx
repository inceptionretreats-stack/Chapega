import { Check } from "lucide-react";

const steps = ["Cart", "Details", "Review", "Send on WhatsApp"] as const;

const handoffSteps = [
  { label: "Prepared", detail: "Order details checked" },
  { label: "Open WhatsApp", detail: "Scan the QR code or tap Open WhatsApp" },
  { label: "Tap Send", detail: "You choose when to send" },
  { label: "Shop confirms", detail: "Confirmation happens in WhatsApp" },
] as const;

type StepState = "active" | "done" | "upcoming";

function getStepState(number: number, active: number): StepState {
  if (number === active) return "active";
  if (number < active) return "done";
  return "upcoming";
}

export function CheckoutStepper({ active }: { active: 1 | 2 | 3 | 4 }) {
  const handoff = active === 4;
  return (
    <nav
      className={`checkout-stepper ${handoff ? "checkout-stepper--handoff" : "checkout-stepper--transaction"}`}
      aria-label="Checkout progress"
    >
      <ol className="checkout-stepper__track">
        {steps.map((step, index) => {
          const number = index + 1;
          const state = getStepState(number, active);
          return (
            <li
              className={`checkout-step ${state === "upcoming" ? "" : state}`}
              key={step}
              aria-current={state === "active" ? "step" : undefined}
              aria-posinset={number}
              aria-setsize={steps.length}
              data-step={number}
            >
              <span className="checkout-step__number" aria-hidden="true">
                {number < active ? <Check size={15} strokeWidth={2.4} /> : number}
              </span>
              <span className="checkout-step__copy">
                <span className="sr-only">
                  Step {number} of {steps.length}.{" "}
                  {state === "done"
                    ? "Completed"
                    : state === "active"
                      ? "Current step"
                      : "Upcoming"}
                  :{" "}
                </span>
                <span className="checkout-step__label">{step}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function HandoffStatusRail({ active }: { active: 1 | 2 | 3 | 4 }) {
  return (
    <nav className="checkout-stepper handoff-status" aria-label="WhatsApp handoff status">
      <ol className="checkout-stepper__track handoff-status__track">
        {handoffSteps.map((step, index) => {
          const number = index + 1;
          const state = getStepState(number, active);
          return (
            <li
              className={`checkout-step handoff-status__step ${state === "upcoming" ? "" : state}`}
              key={step.label}
              aria-current={state === "active" ? "step" : undefined}
              aria-posinset={number}
              aria-setsize={handoffSteps.length}
              data-step={number}
            >
              <span className="checkout-step__number handoff-status__number" aria-hidden="true">
                {state === "done" ? <Check size={15} strokeWidth={2.4} /> : number}
              </span>
              <span className="checkout-step__copy handoff-status__copy">
                <span className="sr-only">
                  Step {number} of {handoffSteps.length}.{" "}
                  {state === "done"
                    ? "Completed"
                    : state === "active"
                      ? "Current step"
                      : "Upcoming"}
                  :{" "}
                </span>
                <span className="checkout-step__label">{step.label}</span>
                <span className="checkout-step__detail">{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
