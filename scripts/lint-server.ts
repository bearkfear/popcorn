// Enforce server headers, aggregation-only mod.rs files, size limits and layer boundaries.
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sourceRoot = join(root, "apps/server/src");
const forbidden = new Set([
  "application", "infra", "interface", "sqlx", "axum", "reqwest",
  "librqbit", "popcorn_proto",
]);
const interfaceForbidden = new Set(["infra", "sqlx", "reqwest", "librqbit"]);
let failures = 0;
let files = 0;

function report(path: string, line: number, message: string): void {
  console.error(`${relative(root, path)}:${line}: ${message}`);
  failures++;
}

// Lex only enough Rust to ignore comments/literals and recognize import/path tokens.
function codeTokens(source: string): readonly { readonly value: string; readonly line: number }[] {
  const tokens: { readonly value: string; readonly line: number }[] = [];
  const lexeme = /\/\/[^\n]*|\/\*|(?:br|cr|r)(#*)"|(?:b|c)?"|'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.)|[^'\\\r\n])'|(?:r#)?[A-Za-z_][A-Za-z_0-9]*|::|[^]/gy;
  let offset = 0;
  let line = 1;
  while (offset < source.length) {
    lexeme.lastIndex = offset;
    const match = lexeme.exec(source);
    if (!match) break;
    const value = match[0];
    let end = lexeme.lastIndex;
    if (value === "/*") {
      let depth = 1;
      while (end < source.length && depth > 0) {
        const pair = source.slice(end, end + 2);
        if (pair === "/*") { depth++; end += 2; }
        else if (pair === "*/") { depth--; end += 2; }
        else end++;
      }
    } else if (match[1] !== undefined) {
      const closing = `"${match[1]}`;
      const close = source.indexOf(closing, end);
      end = close < 0 ? source.length : close + closing.length;
    } else if (/^(?:b|c)?"$/.test(value)) {
      while (end < source.length) {
        const character = source[end++];
        if (character === "\\") end++;
        else if (character === '"') break;
      }
    } else if (!value.startsWith("//") && !value.startsWith("'") && !/^\s$/.test(value)) {
      tokens.push({ value: value.replace(/^r#/, ""), line });
    }
    line += source.slice(offset, end).split("\n").length - 1;
    offset = end;
  }
  return tokens;
}

// Accept external module declarations and imports/reexports, with optional attributes.
function checkModuleIndex(path: string, tokens: ReturnType<typeof codeTokens>): void {
  let index = 0;
  while (index < tokens.length) {
    const start = tokens[index];
    if (!start) break;
    if (start.value === "#" && tokens[index + 1]?.value === "[") {
      index += 2;
      let depth = 1;
      while (index < tokens.length && depth > 0) {
        if (tokens[index]?.value === "[") depth++;
        if (tokens[index]?.value === "]") depth--;
        index++;
      }
      continue;
    }
    if (tokens[index]?.value === "pub") {
      index++;
      if (tokens[index]?.value === "(") {
        while (index < tokens.length && tokens[index]?.value !== ")") index++;
        index++;
      }
    }
    const kind = tokens[index]?.value;
    if (kind === "mod" && /^[A-Za-z_][A-Za-z_0-9]*$/.test(tokens[index + 1]?.value ?? "")
      && tokens[index + 2]?.value === ";") {
      index += 3;
      continue;
    }
    if (kind === "use") {
      while (index < tokens.length && tokens[index]?.value !== ";") index++;
      index++;
      continue;
    }
    report(path, start.line, "mod.rs may only declare external modules and imports/reexports; move implementation to a descriptive file");
    return;
  }
}

async function checkDirectory(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (path === join(sourceRoot, "generated")) continue;
    if (entry.isDirectory()) {
      await checkDirectory(path);
      continue;
    }
    if (!entry.name.endsWith(".rs")) continue;
    const source = await Bun.file(path).text();
    const lines = source.split("\n");
    const physicalLines = lines.length - Number(source.endsWith("\n"));
    files++;
    if (physicalLines > 250) {
      report(path, 1, `${physicalLines} physical lines exceeds the 250-line limit (tests included)`);
    }
    if (!/^\/\/[!/]?[^\r\n]*[\p{L}\p{N}]/u.test(lines[0] ?? "")) {
      report(path, 1, "first line must be a meaningful // or //! comment");
    }
    const localPath = relative(sourceRoot, path).split("\\").join("/");
    const isCore = localPath === "core.rs" || localPath.startsWith("core/");
    const isApplication = localPath === "application.rs" || localPath.startsWith("application/");
    const isInterface = localPath === "interface.rs" || localPath.startsWith("interface/");
    const tokens = codeTokens(source);
    if (entry.name === "mod.rs") checkModuleIndex(path, tokens);
    if (!isCore && tokens.some((token) => token.value === "test")) {
      report(path, 1, "server tests belong in core only");
    }
    if (!isCore && !isApplication && !isInterface) continue;
    let importing = false;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (!token) continue;
      if (token.value === "use" || token.value === "extern") importing = true;
      if (token.value === ";") importing = false;
      const blocked = isInterface ? interfaceForbidden.has(token.value)
        : forbidden.has(token.value) && (isCore || token.value !== "application");
      if (blocked && tokens[index - 1]?.value !== "as"
        && (importing || tokens[index + 1]?.value === "::")) {
        const layer = isCore ? "core" : isApplication ? "application" : "interface";
        report(path, token.line, `${layer} must not depend on ${token.value}`);
      }
    }
  }
}

await checkDirectory(sourceRoot);
if (failures > 0) {
  console.error(`Server structure lint failed: ${failures} violation(s) in ${files} handwritten Rust files.`);
  process.exitCode = 1;
} else {
  console.log(`Server structure lint passed: ${files} handwritten Rust files.`);
}
