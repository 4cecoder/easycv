import Link from "next/link";

/** Small "you agree to the Terms / see Privacy" line shown next to payment and sign-in buttons. */
export function CheckoutLegalNote({
  action = "continuing",
  className = "",
}: {
  action?: string;
  className?: string;
}) {
  return (
    <p className={`text-[11px] leading-relaxed text-muted-foreground ${className}`}>
      By {action} you agree to our{" "}
      <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link> and
      acknowledge our{" "}
      <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
    </p>
  );
}
