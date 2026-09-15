import { describe, expect, it } from "vitest";
import { sniffMime } from "./uploads";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe("sniffMime", () => {
  it("recognises PNG, JPEG, GIF and WebP signatures", () => {
    expect(sniffMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes("GIF89a", 1, 0))).toBe("image/gif");
    expect(sniffMime(bytes("RIFF", 0, 0, 0, 0, "WEBP", "VP8 "))).toBe("image/webp");
  });

  it("rejects SVG, HTML and executables even when renamed", () => {
    expect(sniffMime(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffMime(bytes("<!doctype html><script>"))).toBeNull();
    expect(sniffMime(bytes("MZ", 0x90, 0))).toBeNull();
  });

  it("rejects truncated files", () => {
    expect(sniffMime(bytes(0x89, "PN"))).toBeNull();
    expect(sniffMime(new Uint8Array())).toBeNull();
  });
});
