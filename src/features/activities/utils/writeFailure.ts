/**
 * Copy for a failed activity write whose UI already showed the optimistic
 * result. Two things have to be said, in this order: the change was undone, and
 * why. Everything the user sees on the map is otherwise a lie.
 */

// Callable errors that mean "the request never got a verdict". Their `message`
// is transport noise ("INTERNAL", "deadline-exceeded") and must never be shown.
const CONNECTION_CODES = new Set([
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/cancelled',
  'functions/unknown',
  'unavailable',
  'deadline-exceeded',
]);

function connectionFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && CONNECTION_CODES.has(code);
}

/**
 * `undone` is the reassurance, in the app's voice — e.g. "Deine Activity ist
 * wieder da." The server's own HttpsError messages are already German and
 * user-facing, so they are passed through; a lost connection gets an honest
 * guess instead of a fake reason.
 */
export function writeFailureMessage(error: unknown, undone: string): string {
  if (!connectionFailure(error) && error instanceof Error && error.message.trim()) {
    return `${error.message.trim()}\n\n${undone}`;
  }
  return `${undone} Die Änderung kam nicht durch — prüfe deine Internetverbindung und versuch es gleich noch einmal.`;
}
