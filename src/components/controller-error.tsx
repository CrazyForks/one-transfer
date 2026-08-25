export function ControllerError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="app-style-108">{message}</div>;
}
