export function safeNnt(arrPercent) {
  if (!arrPercent || arrPercent <= 0) return null;
  return Math.round(100 / arrPercent);
}

export function safeNnh(ariPercent) {
  if (!ariPercent || ariPercent <= 0) return null;
  return Math.round(100 / ariPercent);
}
