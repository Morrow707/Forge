import { Check, X } from "lucide-react";
import { PASSWORD_RULES } from "@shared/password-rules";
import { cn } from "@/lib/utils";

/**
 * THE RULES, SHOWN WHILE SOMEBODY TYPES, RATHER THAN AFTER THEY SUBMIT.
 *
 * Scott, 2026-10-01: "give them the little advice too, have the verbiage start red, once
 * they reach six characters have it go green then when they add a special character have
 * that go green and same with the number."
 *
 * Each rule is judged on its own, so a password that is long enough but has no digit shows
 * one green line and two red ones rather than a single verdict. A combined pass/fail tells
 * the person they are wrong without telling them what to change, which is the whole reason
 * a password field is the most abandoned field on a signup form.
 *
 * It reads the SAME `PASSWORD_RULES` the server validates with (shared/password-rules.ts),
 * so this cannot drift into promising something the route then refuses. That mattered here:
 * the rule it replaced lived in six separate zod schemas.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. The tick and the cross differ in shape, and each line is
 * announced to a screen reader as met or not met, so somebody who cannot tell red from
 * green still gets the same information.
 */
export function PasswordRequirements({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-1", className)} aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <li
            key={rule.id}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-colors",
              met ? "text-success" : "text-destructive",
            )}
          >
            {met ? (
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{rule.label}</span>
            <span className="sr-only">{met ? " met" : " not met yet"}</span>
          </li>
        );
      })}
    </ul>
  );
}
