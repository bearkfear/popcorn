// Calendar versions use a numeric DDNN patch so installers preserve version order.
export function parseVersion(value: string): { date: string; revision: number; parts: number[] } {
  const match = /^([1-9]\d{3})\.([1-9]|1[0-2])\.([1-9]\d{0,3})$/.exec(value);
  if (!match) throw new Error(`Versão inválida: ${value}. Use AAAA.MM.DDNN.`);
  const [, year, month, patch] = match;
  const number = Number(patch);
  const day = number <= 31 ? number : Math.floor(number / 100);
  const revision = number <= 31 ? 1 : number % 100;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || day < 1 || day > 31 || revision === 0) {
    throw new Error(`Data ou revisão inválida: ${value}.`);
  }
  return { date, revision, parts: value.split(".").map(Number) };
}

export function assertNewer(next: string, current: string): void {
  const a = parseVersion(next).parts;
  const b = parseVersion(current).parts;
  const difference = a.map((part, index) => part - (b[index] ?? 0)).find((part) => part !== 0) ?? 0;
  if (difference <= 0) throw new Error(`A versão ${next} precisa ser maior que ${current}.`);
}

export function nextVersion(current: string, now = new Date()): string {
  const previous = parseVersion(current);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  if (date < previous.date) throw new Error("A data local é anterior à versão atual; informe uma versão explicitamente.");
  const revision = date === previous.date ? previous.revision + 1 : 1;
  if (revision > 99) throw new Error("Limite de 99 versões por dia atingido.");
  const next = `${year}.${Number(month)}.${Number(day) * 100 + revision}`;
  assertNewer(next, current);
  return next;
}

// Only rewrite declared version fields; dependency versions and checksums stay intact.
export function replaceVersion(source: string, current: string, next: string, count: number): string {
  let found = 0;
  const result = source.replace(/("version"\s*:\s*"|^version\s*=\s*")([^"\n]+)(")/gm,
    (whole: string, prefix: string, value: string, suffix: string) => {
      if (value !== current) return whole;
      found++;
      return `${prefix}${next}${suffix}`;
    });
  if (found !== count) throw new Error(`Esperados ${count} campos de versão ${current}; encontrados ${found}.`);
  return result;
}
