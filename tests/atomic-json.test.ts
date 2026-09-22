import { mkdtempSync } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJson, writeJsonAtomic } from "../src/storage/atomic-json.js";

describe("atomic-json", () => {
  it("readJson returns null when the file does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    expect(await readJson(join(dir, "missing.json"))).toBeNull();
  });

  it("readJson throws on corrupt JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    const path = join(dir, "bad.json");
    await writeFile(path, "{not valid json");
    await expect(readJson(path)).rejects.toThrow();
  });

  it("writeJsonAtomic creates parent directories and round-trips the value", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    const path = join(dir, "nested", "value.json");
    await writeJsonAtomic(path, { a: 1, b: [1, 2, 3] });
    expect(await readJson(path)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("writeJsonAtomic applies the given file mode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "atomic-json-"));
    const path = join(dir, "secret.json");
    await writeJsonAtomic(path, { token: "x" }, 0o600);
    const stats = await stat(path);
    expect(stats.mode & 0o777).toBe(0o600);
  });
});
