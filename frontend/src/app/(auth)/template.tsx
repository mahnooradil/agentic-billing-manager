/**
 * Route-transition wrapper for the auth screens. Remounts per navigation so
 * switching between login and register fades + slides smoothly.
 */
export default function AuthTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-reveal">{children}</div>;
}
