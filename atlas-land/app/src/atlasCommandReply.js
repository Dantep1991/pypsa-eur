// Presentation only: verdicts and execution evidence keep their existing checks.
// Never turn an unverified or failed action into a terse success claim.
export function atlasCommandReply({ judge, error = '', answer = '' } = {}) {
  if (error) return error;
  // Concise action confirmations must not replace the requested data/list
  // with a generic verifier observation. Only a verified read can supply it.
  if (judge?.verdict === 'pass') return answer.trim() || judge.summary?.trim() || 'Updated.';
  if (judge?.verdict === 'local_pass') return 'Map controls updated.';
  if (judge?.verdict === 'repair') return judge.summary?.trim() || 'Map needs correction.';
  return 'Unable to verify the update.';
}
