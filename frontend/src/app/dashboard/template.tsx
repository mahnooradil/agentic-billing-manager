/**
 * Route-transition wrapper for /dashboard/*. Unlike the layout, a template
 * remounts on every navigation, so each page enters with a smooth fade + slide
 * (CSS `animate-reveal`) while the shell (sidebar/navbar) stays put.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="animate-reveal flex flex-1 flex-col">{children}</div>;
}
