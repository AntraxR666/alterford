export type WalletKind = "embedded" | "external" | "unknown";

interface ErrorContext {
  walletKind?: WalletKind;
  targetChainName: string;
}

const INVALID_STATE_SELECTOR = "0xbaf3f0f7";

export function missingNativeGasMessage(context: ErrorContext): string {
  const walletName = context.walletKind === "embedded" ? "wallet con email" : "wallet";
  return `La ${walletName} necesita ETH suficiente en ${context.targetChainName} para pagar gas. No se movieron fondos.`;
}

export function readableTransactionError(error: unknown, context: ErrorContext): string {
  const message = errorMessages(error);
  const primaryMessage = firstMessage(error) || "La transaccion fallo.";
  const walletName = context.walletKind === "embedded" ? "wallet con email" : "wallet";

  if (/user rejected|user denied|rejected/i.test(message)) {
    return "Operacion cancelada en la wallet. No se movieron fondos.";
  }
  if (message.includes(INVALID_STATE_SELECTOR) || /invalid state|market.*(closed|resolved)|market.*not open/i.test(message)) {
    return "Este mercado ya no esta abierto. No se movieron fondos.";
  }
  if (/exceeds max transaction gas limit|transaction gas limit/i.test(message)) {
    return `La ${walletName} no pudo preparar esta transaccion por un limite de gas del proveedor. No se movieron fondos. Vuelve a intentarlo o usa una wallet externa.`;
  }
  if (/insufficient funds/i.test(message)) {
    return missingNativeGasMessage(context);
  }
  if (/allowance/i.test(message)) {
    return "Falta autorizar aUSDT antes de continuar. No se movieron fondos.";
  }
  if (/switch chain|wrong chain|chain mismatch|network/i.test(message)) {
    if (context.walletKind === "embedded") {
      return `La wallet con email no pudo activar ${context.targetChainName}. Vuelve a entrar con email y prueba de nuevo. No se movieron fondos.`;
    }
    return `La wallet no pudo activar ${context.targetChainName}. Selecciona esa red en tu wallet y vuelve a intentar. No se movieron fondos.`;
  }
  return primaryMessage;
}

export function readableSwitchError(error: unknown, context: ErrorContext): string {
  const message = errorMessages(error);
  if (/user rejected|user denied|rejected/i.test(message)) {
    return `Cancelaste el cambio de red. Selecciona ${context.targetChainName} para continuar.`;
  }
  if (context.walletKind === "embedded") {
    return `La wallet con email no pudo activar ${context.targetChainName}. Vuelve a entrar con email y prueba de nuevo.`;
  }
  return `No pude activar ${context.targetChainName}. Selecciona esa red en tu wallet y vuelve a intentar.`;
}

function firstMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message) return error.message.split("\n")[0];
  if (typeof error === "string") return error.split("\n")[0];
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message.split("\n")[0] : undefined;
  }
  return undefined;
}

function errorMessages(error: unknown): string {
  const pending = [error];
  const visited = new Set<unknown>();
  const messages: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current === null || visited.has(current)) continue;
    visited.add(current);
    if (typeof current === "string") {
      messages.push(current);
      continue;
    }
    if (typeof current !== "object") continue;
    const value = current as Record<string, unknown>;
    for (const key of ["message", "shortMessage", "details", "reason"]) {
      if (typeof value[key] === "string") messages.push(value[key] as string);
    }
    if (value.cause !== undefined) pending.push(value.cause);
  }

  return messages.join("\n").toLowerCase();
}
