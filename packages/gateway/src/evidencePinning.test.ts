import { describe, expect, it, vi } from "vitest";
import {
  EvidencePinningService,
  PinataEvidencePinner,
  type EvidencePinner,
} from "./evidencePinning.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("evidence image pinning", () => {
  it("validates and returns a content-addressed IPFS reference", async () => {
    const pinner: EvidencePinner = {
      pin: vi.fn(async () => ({ cid: "bafy-photo" })),
    };
    const service = new EvidencePinningService(pinner, 10 * 1024 * 1024);

    const result = await service.pinImage({
      fileName: "proof.png",
      mimeType: "image/png",
      bytesBase64: png.toString("base64"),
    });

    expect(result).toMatchObject({
      cid: "bafy-photo",
      uri: "ipfs://bafy-photo",
      size: png.length,
      mimeType: "image/png",
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(pinner.pin).toHaveBeenCalledWith(expect.objectContaining({ bytes: png }));
  });

  it.each(["image/gif", "text/html", "application/pdf"])(
    "rejects unsupported content type %s before provider access",
    async (mimeType) => {
      const pinner: EvidencePinner = { pin: vi.fn() };
      const service = new EvidencePinningService(pinner, 10 * 1024 * 1024);

      await expect(service.pinImage({
        fileName: "proof.bin",
        mimeType,
        bytesBase64: png.toString("base64"),
      })).rejects.toThrow("JPEG, PNG o WebP");
      expect(pinner.pin).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed base64 and oversized files before provider access", async () => {
    const pinner: EvidencePinner = { pin: vi.fn() };
    const service = new EvidencePinningService(pinner, 4);

    await expect(service.pinImage({
      fileName: "proof.png",
      mimeType: "image/png",
      bytesBase64: "not-base64!",
    })).rejects.toThrow("base64");
    await expect(service.pinImage({
      fileName: "proof.png",
      mimeType: "image/png",
      bytesBase64: png.toString("base64"),
    })).rejects.toThrow("excede");
    expect(pinner.pin).not.toHaveBeenCalled();
  });

  it("does not expose provider secrets when pinning fails", async () => {
    const service = new EvidencePinningService({
      pin: vi.fn(async () => { throw new Error("JWT pinata-super-secret rejected"); }),
    }, 100);

    await expect(service.pinImage({
      fileName: "proof.png",
      mimeType: "image/png",
      bytesBase64: png.toString("base64"),
    })).rejects.toThrow("No se pudo publicar la evidencia en IPFS");
  });

  it("uploads a multipart file to Pinata without returning its JWT", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ IpfsHash: "bafy-pinata" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const pinner = new PinataEvidencePinner({
      token: "pinata-super-secret",
      apiUrl: "https://pin.example/pinFileToIPFS",
      fetcher,
    });

    await expect(pinner.pin({ fileName: "proof.png", mimeType: "image/png", bytes: png }))
      .resolves.toEqual({ cid: "bafy-pinata" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://pin.example/pinFileToIPFS",
      expect.objectContaining({ headers: { Authorization: "Bearer pinata-super-secret" } }),
    );
  });
});
