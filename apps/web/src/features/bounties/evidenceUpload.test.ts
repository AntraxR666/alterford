import { describe, expect, it } from "vitest";
import { validateEvidenceImage } from "./evidenceUpload";

describe("validateEvidenceImage", () => {
  it("accepts supported images within the gateway limit", () => {
    expect(() => validateEvidenceImage(
      { name: "proof.webp", type: "image/webp", size: 2_000 },
      { maxBytes: 10_000, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
    )).not.toThrow();
  });

  it("rejects unsupported or oversized evidence before upload", () => {
    const policy = { maxBytes: 1_000, mimeTypes: ["image/jpeg", "image/png", "image/webp"] };
    expect(() => validateEvidenceImage({ name: "proof.pdf", type: "application/pdf", size: 100 }, policy))
      .toThrow("JPEG, PNG o WebP");
    expect(() => validateEvidenceImage({ name: "proof.png", type: "image/png", size: 1_001 }, policy))
      .toThrow("excede");
  });
});
