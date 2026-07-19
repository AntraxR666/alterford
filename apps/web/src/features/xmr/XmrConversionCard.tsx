import { CheckCircle2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { XmrConversionAuthorization } from "@alterford/sdk";
import type { Address, Hex } from "viem";
import {
  AlterfordGatewayClient,
  type XmrConversionQuote,
  type XmrConversionRecord,
} from "../../web3/gatewayClient";

export type XmrGateway = Pick<
  AlterfordGatewayClient,
  "xmrCapabilities" | "createXmrQuote" | "createXmrConversion" | "xmrConversion"
>;

interface XmrConversionCardProps {
  beneficiary?: Address;
  chainId: number;
  gateway?: XmrGateway;
  signAuthorization: (input: XmrConversionAuthorization) => Promise<Hex>;
}

type QuoteState =
  | { mode: "automatic"; quote: XmrConversionQuote; nonce: bigint }
  | { mode: "assisted"; case: { id: string; status: string; reason: string } };

const terminalStatuses = new Set(["completed", "expired", "refunded", "failed"]);

export function XmrConversionCard({
  beneficiary,
  chainId,
  gateway: gatewayOverride,
  signAuthorization,
}: XmrConversionCardProps) {
  const gatewayUrl = import.meta.env.VITE_GATEWAY_URL;
  const gateway = useMemo<XmrGateway | undefined>(
    () => gatewayOverride ?? (gatewayUrl ? new AlterfordGatewayClient(gatewayUrl) : undefined),
    [gatewayOverride, gatewayUrl],
  );
  const [enabled, setEnabled] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState("");
  const [provider, setProvider] = useState("");
  const [thresholdMinor, setThresholdMinor] = useState(0n);
  const [amount, setAmount] = useState("100");
  const [quoteState, setQuoteState] = useState<QuoteState>();
  const [conversion, setConversion] = useState<XmrConversionRecord>();
  const [status, setStatus] = useState<"idle" | "pending" | "signing" | "ready" | "failed">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gateway) return;
    let active = true;
    gateway.xmrCapabilities()
      .then((capabilities) => {
        if (!active || !capabilities.enabled || !capabilities.available) return;
        if (capabilities.settlementChainId !== chainId) {
          setUnavailableReason("XMR no disponible en esta red.");
          return;
        }
        setEnabled(true);
        setProvider(capabilities.provider);
        setThresholdMinor(BigInt(capabilities.assistedThresholdMinor));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [chainId, gateway]);

  useEffect(() => {
    if (!gateway || !conversion || terminalStatuses.has(conversion.status)) return;
    let active = true;
    const refresh = () => gateway.xmrConversion(conversion.id)
      .then((next) => {
        if (active) setConversion(next);
      })
      .catch((caught) => {
        if (active) setError(readableError(caught, "No se pudo actualizar la conversion."));
      });
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [conversion, gateway]);

  if (!gateway) return null;
  if (unavailableReason) {
    return (
      <article className="info-card">
        <strong>{unavailableReason}</strong>
        <span>Cambia a la red de liquidacion indicada por Alterford antes de solicitar una cotizacion.</span>
      </article>
    );
  }
  if (!enabled) return null;

  async function requestQuote(assistanceRequested: boolean) {
    if (!gateway || !beneficiary) {
      setStatus("failed");
      setError("Conecta una wallet Base: ahi recibiras directamente el USDC convertido.");
      return;
    }
    try {
      const settlementAmountMinor = parseUsdcAmount(amount);
      setStatus("pending");
      setError("");
      setConversion(undefined);
      const result = await gateway.createXmrQuote({
        destination: beneficiary,
        settlementAmountMinor,
        idempotencyKey: `xmr-quote-${crypto.randomUUID()}`,
        assistanceRequested,
      });
      setQuoteState(result as QuoteState);
      setStatus("ready");
    } catch (caught) {
      setStatus("failed");
      setError(readableError(caught, "No se pudo obtener la cotizacion XMR."));
    }
  }

  async function acceptQuote() {
    if (!gateway || !beneficiary || quoteState?.mode !== "automatic") return;
    try {
      if (quoteState.quote.expiresAt <= Math.floor(Date.now() / 1_000)) {
        throw new Error("La cotizacion vencio. Solicita una nueva antes de enviar XMR.");
      }
      setStatus("signing");
      setError("");
      const idempotencyKey = `xmr-conversion-${crypto.randomUUID()}`;
      const authorization: XmrConversionAuthorization = {
        destination: beneficiary,
        quoteId: quoteState.quote.id,
        idempotencyKey,
        nonce: quoteState.nonce,
        deadline: Math.floor(Date.now() / 1_000) + 10 * 60,
      };
      const signature = await signAuthorization(authorization);
      const created = await gateway.createXmrConversion({ ...authorization, signature });
      setConversion(created);
      setStatus("ready");
    } catch (caught) {
      setStatus("failed");
      setError(readableError(caught, "No se pudo crear la conversion XMR."));
    }
  }

  const automaticQuote = quoteState?.mode === "automatic" ? quoteState.quote : undefined;
  const expired = automaticQuote ? automaticQuote.expiresAt <= Math.floor(Date.now() / 1_000) : false;
  const xmrPaymentUri = conversion && automaticQuote
    ? `monero:${conversion.depositAddress}?tx_amount=${formatAtomic(automaticQuote.depositAmountAtomic, 12)}`
    : "";

  return (
    <article className="info-card xmr-conversion-card">
      <div className="card-title-row">
        <LockKeyhole size={18} />
        <h2>Entrar con Monero</h2>
      </div>
      <span>
        Pagas XMR al proveedor y recibes USDC real directamente en tu wallet Base. Alterford no custodia XMR.
      </span>
      {!quoteState && (
        <>
          <label>
            USDC que quieres recibir
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="100"
            />
          </label>
          <button onClick={() => requestQuote(false)} disabled={status === "pending" || !beneficiary}>
            {status === "pending" ? "Buscando cotizacion" : "Cotizar XMR"}
          </button>
          <button className="secondary-action" onClick={() => requestQuote(true)} disabled={status === "pending" || !beneficiary}>
            Solicitar atencion asistida
          </button>
          <small>
            Atencion asistida desde {formatMinor(thresholdMinor, 6)} USDC, o antes si la solicitas. No envies fondos sin cotizacion.
          </small>
        </>
      )}

      {quoteState?.mode === "assisted" && (
        <div className="xmr-assistance">
          <strong>Expediente oficial</strong>
          <code>{quoteState.case.id}</code>
          <span>Estado: {quoteState.case.status}</span>
          <small>No envies XMR hasta recibir instrucciones verificadas dentro de este expediente.</small>
          <button onClick={() => setQuoteState(undefined)}>Nueva solicitud</button>
        </div>
      )}

      {automaticQuote && !conversion && (
        <div className="xmr-quote-review">
          <strong>Revisa antes de firmar</strong>
          <dl>
            <QuoteLine label="Envias" value={`${formatAtomic(automaticQuote.depositAmountAtomic, 12)} XMR`} />
            <QuoteLine label="Recibes neto" value={`${formatMinor(automaticQuote.netSettlementAmountMinor, 6)} USDC`} />
            <QuoteLine label="Proveedor" value={displayProvider(automaticQuote.provider || provider)} />
            <QuoteLine label="Tasa" value={`1 XMR = ${automaticQuote.rate} USDC`} />
            <QuoteLine label="Coste proveedor" value={`${formatMinor(automaticQuote.providerFeeMinor, 6)} USDC`} />
            <QuoteLine label="Coste de red" value={`${formatMinor(automaticQuote.networkFeeMinor, 6)} USDC`} />
            <QuoteLine label="Modo de costes" value={automaticQuote.feeMode === "deducted" ? "Descontados del resultado" : "Anadidos al importe"} />
            <QuoteLine label="Cotizacion valida hasta" value={new Date(automaticQuote.expiresAt * 1_000).toLocaleTimeString()} />
          </dl>
          <span>Wallet Base que recibira el USDC:</span>
          <code>{automaticQuote.destination}</code>
          <small>La tasa puede incluir el spread del proveedor. Nunca sumamos y descontamos el mismo coste.</small>
          <button onClick={acceptQuote} disabled={status === "signing" || expired}>
            {status === "signing" ? "Esperando firma" : expired ? "Cotizacion vencida" : "Aceptar cotizacion y firmar"}
          </button>
          <button className="secondary-action" onClick={() => setQuoteState(undefined)}>Cancelar</button>
        </div>
      )}

      {conversion && automaticQuote && (
        <div className="xmr-payment">
          <div className="deposit-qr" aria-label="QR de pago Monero al proveedor">
            <QRCodeSVG value={xmrPaymentUri} size={148} marginSize={2} />
          </div>
          <strong>Envia exactamente {formatAtomic(automaticQuote.depositAmountAtomic, 12)} XMR</strong>
          <code>{conversion.depositAddress}</code>
          <span>Estado: {conversionStatusLabel(conversion.status)}</span>
          <small>Alterford no recibe tu XMR. Esta direccion pertenece a la orden del proveedor seleccionado.</small>
          <button onClick={() => navigator.clipboard?.writeText(conversion.depositAddress)}>Copiar direccion XMR</button>
          {conversion.settlement && (
            <a
              className="button-link"
              href={`${chainId === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org"}/tx/${conversion.settlement.transactionHash}`}
              target="_blank"
              rel="noopener"
            >
              <CheckCircle2 size={16} /> Ver liquidacion verificada en Base
            </a>
          )}
        </div>
      )}
      {status === "failed" && <small className="error-text">{error}</small>}
    </article>
  );
}

function QuoteLine({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function parseUsdcAmount(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) throw new Error("Introduce un monto USDC valido con hasta 6 decimales.");
  const [whole, fraction = ""] = normalized.split(".");
  const amount = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (amount <= 0n) throw new Error("El monto debe ser mayor que cero.");
  return amount;
}

function formatMinor(value: bigint, decimals: number) {
  return formatAtomic(value, decimals);
}

function formatAtomic(value: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function displayProvider(value: string) {
  return value.toLowerCase() === "sideshift" ? "SideShift" : value;
}

function conversionStatusLabel(value: string) {
  const labels: Record<string, string> = {
    awaiting_deposit: "esperando tu envio XMR",
    confirming_xmr: "confirmando XMR",
    converting: "convirtiendo",
    settling_base: "enviando USDC a Base",
    completed: "USDC recibido y verificado",
    expired: "orden vencida",
    refunding: "reembolso en proceso",
    refunded: "reembolsado",
    failed: "requiere revision",
    assistance_required: "atencion asistida requerida",
  };
  return labels[value] ?? value;
}

function readableError(caught: unknown, fallback: string) {
  if (!(caught instanceof Error)) return fallback;
  if (/rejected|denied/i.test(caught.message)) return "Cancelaste la firma. No se envio XMR ni se movieron fondos.";
  return caught.message || fallback;
}
