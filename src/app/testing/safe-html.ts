export function safeHtmlAsString(safe: unknown): string {
  return (safe as { changingThisBreaksApplicationSecurity: string }).changingThisBreaksApplicationSecurity;
}
