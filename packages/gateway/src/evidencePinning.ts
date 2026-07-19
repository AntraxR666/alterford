import { createHash } from "node:crypto";

export const EVIDENCE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const DEFAULT_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export interface EvidenceImageInput {
  fileName: string;
  mimeType: string;
  bytesBase64: string;
}

export interface EvidencePinner {
  pin(input: { fileName: string; mimeType: string; bytes: Buffer }): Promise<{ cid: string }>;
}

export class EvidencePinningService {
  constructor(
    private readonly pinner: EvidencePinner,
    readonly maxBytes = DEFAULT_EVIDENCE_MAX_BYTES,
  ) {}

  async pinImage(input: EvidenceImageInput) {
    if (!EVIDENCE_IMAGE_TYPES.includes(input.mimeType as (typeof EVIDENCE_IMAGE_TYPES)[number])) {
      throw new Error("La evidencia debe ser JPEG, PNG o WebP.");
    }
    if (!input.fileName.trim()) throw new Error("El archivo de evidencia necesita un nombre.");
    if (!isStrictBase64(input.bytesBase64)) throw new Error("La evidencia no contiene base64 valido.");
    const bytes = Buffer.from(input.bytesBase64, "base64");
    if (bytes.length === 0) throw new Error("La imagen de evidencia esta vacia.");
    if (bytes.length > this.maxBytes) {
      throw new Error(`La imagen excede el limite de ${formatMiB(this.maxBytes)} MiB.`);
    }

    try {
      const { cid } = await this.pinner.pin({
        fileName: safeFileName(input.fileName),
        mimeType: input.mimeType,
        bytes,
      });
      if (!cid.trim()) throw new Error("Missing CID");
      return {
        cid,
        uri: `ipfs://${cid}`,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
        mimeType: input.mimeType,
      };
    } catch {
      throw new Error("No se pudo publicar la evidencia en IPFS. Intenta nuevamente.");
    }
  }
}

export class PinataEvidencePinner implements EvidencePinner {
  private readonly token: string;
  private readonly apiUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { token: string; apiUrl?: string; fetcher?: typeof fetch }) {
    this.token = options.token;
    this.apiUrl = options.apiUrl || "https://api.pinata.cloud/pinning/pinFileToIPFS";
    this.fetcher = options.fetcher || fetch;
  }

  async pin(input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const body = new FormData();
    body.append("file", new File([toArrayBuffer(input.bytes)], input.fileName, { type: input.mimeType }));
    body.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    body.append("pinataMetadata", JSON.stringify({
      name: `alterford-evidence-${Date.now()}-${input.fileName}`,
    }));
    const response = await this.fetcher(this.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body,
    });
    if (!response.ok) throw new Error(`Pinning provider rejected the upload (${response.status}).`);
    const result = await response.json() as { IpfsHash?: string; cid?: string };
    const cid = result.IpfsHash || result.cid;
    if (!cid) throw new Error("Pinning provider did not return a CID.");
    return { cid };
  }
}

export class FleekEvidencePinner implements EvidencePinner {
  constructor(
    private readonly options: { token: string; projectId: string },
  ) {}

  async pin(input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const { FleekSdk, PersonalAccessTokenService } = await import("@fleek-platform/sdk/node");
    const accessTokenService = new PersonalAccessTokenService({
      personalAccessToken: this.options.token,
      projectId: this.options.projectId,
    });
    const sdk = new FleekSdk({ accessTokenService });
    const result = await sdk.storage().uploadFile({
      file: {
        name: input.fileName,
        stream: () => new Blob([toArrayBuffer(input.bytes)], { type: input.mimeType }).stream(),
      },
    });
    const cid = result.pin.cid.toString();
    if (!cid) throw new Error("Fleek did not return a CID.");
    return { cid };
  }
}

function isStrictBase64(value: string) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function safeFileName(value: string) {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return sanitized || "evidence-image";
}

function formatMiB(bytes: number) {
  return Math.max(1, Math.floor(bytes / (1024 * 1024)));
}

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
