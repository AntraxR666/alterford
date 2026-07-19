import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Hex } from "viem";
import { XmrConversionCard, type XmrGateway } from "./XmrConversionCard";

const wallet = "0x1111111111111111111111111111111111111111" as const;

describe("XmrConversionCard", () => {
  afterEach(cleanup);

  it("shows every economic field before requesting a signature and then shows provider payment instructions", async () => {
    const signAuthorization = vi.fn(async () => `0x${"11".repeat(65)}` as Hex);
    const gateway = fixtureGateway();
    const user = userEvent.setup();

    render(
      <XmrConversionCard
        beneficiary={wallet}
        chainId={8453}
        gateway={gateway}
        signAuthorization={signAuthorization}
      />,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entrar con Monero" })).toBeInTheDocument());
    await user.clear(screen.getByLabelText("USDC que quieres recibir"));
    await user.type(screen.getByLabelText("USDC que quieres recibir"), "100");
    await user.click(screen.getByRole("button", { name: "Cotizar XMR" }));

    expect(await screen.findByText("1.25 XMR")).toBeInTheDocument();
    expect(screen.getByText("100 USDC")).toBeInTheDocument();
    expect(screen.getByText("SideShift")).toBeInTheDocument();
    expect(screen.getByText("1 USDC")).toBeInTheDocument();
    expect(screen.getByText("0 USDC")).toBeInTheDocument();
    expect(screen.getByText(wallet)).toBeInTheDocument();
    expect(signAuthorization).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Aceptar cotizacion y firmar" }));

    await waitFor(() => expect(signAuthorization).toHaveBeenCalledWith(expect.objectContaining({
      destination: wallet,
      quoteId: "xmr-quote-0001",
      nonce: 4n,
    })));
    expect(await screen.findByText("4".repeat(95))).toBeInTheDocument();
    expect(screen.getByText(/Alterford no recibe tu XMR/i)).toBeInTheDocument();
  });

  it("opens an official assistance case without exposing payment instructions", async () => {
    const gateway = fixtureGateway({ assisted: true });
    const user = userEvent.setup();

    render(
      <XmrConversionCard
        beneficiary={wallet}
        chainId={8453}
        gateway={gateway}
        signAuthorization={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "Entrar con Monero" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Solicitar atencion asistida" }));

    expect(await screen.findByText("xmr-case-0001")).toBeInTheDocument();
    expect(screen.getByText(/No envies XMR hasta recibir instrucciones/i)).toBeInTheDocument();
    expect(screen.queryByText("4".repeat(95))).not.toBeInTheDocument();
  });

  it("stays unavailable when the gateway settlement chain differs from the frontend chain", async () => {
    render(
      <XmrConversionCard
        beneficiary={wallet}
        chainId={84532}
        gateway={fixtureGateway()}
        signAuthorization={vi.fn()}
      />,
    );

    expect(await screen.findByText("XMR no disponible en esta red.")).toBeInTheDocument();
    expect(screen.queryByText("Entrar con Monero")).not.toBeInTheDocument();
  });
});

function fixtureGateway(options: { assisted?: boolean } = {}): XmrGateway {
  return {
    xmrCapabilities: vi.fn(async () => ({
      enabled: true,
      available: true,
      provider: "sideshift",
      assistedThresholdMinor: "1500000000",
      settlementChainId: 8453,
    })),
    createXmrQuote: vi.fn(async () => options.assisted
      ? {
          mode: "assisted" as const,
          case: {
            id: "xmr-case-0001",
            status: "open",
            reason: "user_request",
          },
        }
      : {
          mode: "automatic" as const,
          nonce: 4n,
          quote: {
            id: "xmr-quote-0001",
            provider: "sideshift",
            destination: wallet,
            depositAmountAtomic: 1_250_000_000_000n,
            grossSettlementAmountMinor: 101_000_000n,
            providerFeeMinor: 0n,
            networkFeeMinor: 1_000_000n,
            netSettlementAmountMinor: 100_000_000n,
            feeMode: "deducted" as const,
            rate: "80",
            expiresAt: Math.floor(Date.now() / 1_000) + 300,
          },
        }),
    createXmrConversion: vi.fn(async () => ({
      id: "xmr-conversion-0001",
      quoteId: "xmr-quote-0001",
      destination: wallet,
      depositAddress: "4".repeat(95),
      status: "awaiting_deposit",
    })),
    xmrConversion: vi.fn(async () => ({
      id: "xmr-conversion-0001",
      quoteId: "xmr-quote-0001",
      destination: wallet,
      depositAddress: "4".repeat(95),
      status: "awaiting_deposit",
    })),
  };
}
