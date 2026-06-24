// Re-mounts on every navigation, so each route fades in gently.
export default function Template({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="reveal-fade">{children}</div>;
}
