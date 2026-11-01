/** Only return to the Activity list, preserving its filters and pagination. */
export function activityBackTo(state: unknown): string {
  if (
    state &&
    typeof state === 'object' &&
    'backTo' in state &&
    typeof state.backTo === 'string' &&
    /^\/activity(?:\?|$)/.test(state.backTo)
  ) {
    return state.backTo;
  }
  return '/activity';
}
