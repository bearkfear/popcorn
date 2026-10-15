// Utility formatting helpers for data sizes and download transfer rates.
export function bytesLabel(bytes: bigint): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "Tamanho não informado";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

export function rateLabel(bytesPerSecond: bigint): string {
  return `${bytesLabel(bytesPerSecond)}/s`;
}
