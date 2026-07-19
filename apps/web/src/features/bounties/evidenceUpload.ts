export interface EvidenceUploadPolicy {
  maxBytes: number;
  mimeTypes: readonly string[];
}

export const DEFAULT_EVIDENCE_UPLOAD_POLICY: EvidenceUploadPolicy = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ["image/jpeg", "image/png", "image/webp"],
};

export function validateEvidenceImage(
  file: Pick<File, "name" | "type" | "size">,
  policy: EvidenceUploadPolicy = DEFAULT_EVIDENCE_UPLOAD_POLICY,
) {
  if (!policy.mimeTypes.includes(file.type)) {
    throw new Error("La evidencia debe ser una imagen JPEG, PNG o WebP.");
  }
  if (file.size <= 0) throw new Error("La imagen seleccionada esta vacia.");
  if (file.size > policy.maxBytes) {
    throw new Error(`La imagen excede el limite de ${formatMiB(policy.maxBytes)} MiB.`);
  }
  if (!file.name.trim()) throw new Error("La imagen necesita un nombre de archivo.");
}

export function evidenceFileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    reader.onload = () => {
      const value = String(reader.result || "");
      const separator = value.indexOf(",");
      if (separator < 0) return reject(new Error("La imagen no pudo convertirse para su envio."));
      resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatMiB(bytes: number) {
  return Math.max(1, Math.floor(bytes / (1024 * 1024)));
}
