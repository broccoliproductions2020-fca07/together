/** The demo supplies its address and must not call native reverse geocoding. */
export function useCoordinateAddress(
  _latitude: number | undefined,
  _longitude: number | undefined,
  _enabled = true,
): string | null {
  return null;
}
