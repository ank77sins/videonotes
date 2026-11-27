import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface TempCookies {
  path: string;
  cleanup: () => void;
}

export function writeTempCookies(raw?: string): TempCookies | null {
  if (!raw || !raw.trim()) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytcookies-"));
  const file = path.join(dir, "cookies.txt");
  let content = raw.trim();
  if (!content.startsWith("# Netscape HTTP Cookie File")) {
    content = `# Netscape HTTP Cookie File\n${content}\n`;
  }
  fs.writeFileSync(file, content, "utf8");
  return {
    path: file,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
