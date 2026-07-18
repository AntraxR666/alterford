import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AppProviders } from "./AppProviders";

describe("Alterford PWA shell", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("renders the user-friendly markets experience", () => {
    renderWithProviders();

    expect(screen.getByRole("heading", { name: "Alterford" })).toBeInTheDocument();
    expect(screen.getByText("Conectar wallet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mercados/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mi saldo/i })).toBeInTheDocument();
    expect(screen.getByText("Mercados activos")).toBeInTheDocument();
    expect(screen.getByText("Ticket de prediccion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Si" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar prediccion/i })).toBeInTheDocument();
    expect(screen.getByText("Conectar y autorizar no apuestan. Solo se mueve aUSDT cuando presionas Confirmar prediccion y aceptas en la wallet.")).toBeInTheDocument();
  });

  it("keeps the trade ticket mounted when selecting larger quick bet amounts", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: "5" }));

    expect(screen.getByText("Ticket de prediccion")).toBeInTheDocument();
    expect(screen.getAllByText("5 aUSDT").length).toBeGreaterThan(0);
    expect(screen.getByText("Ganancia neta estimada si aciertas")).toBeInTheDocument();
    expect(screen.getByText("Riesgo si pierdes")).toBeInTheDocument();
    expect(screen.getByText("Como se calcula")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar prediccion/i })).toBeInTheDocument();
  });

  it("does not present resolved markets as available for betting", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "https://indexer.example");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/markets")) {
        return new Response(JSON.stringify([{
          id: "1",
          title: "Market 1",
          description: "Finalizado",
          category: "Sports",
          state: "Resolved",
          poolByOutcome: ["1000000", "1000000"],
        }]));
      }
      if (url.endsWith("/challenges")) return new Response(JSON.stringify([]));
      return new Response("Not found", { status: 404 });
    }));

    renderWithProviders();

    await waitFor(() => expect(screen.getByText("Aun no hay mercados abiertos")).toBeInTheDocument());
    expect(screen.queryByText("Market 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar prediccion/i })).not.toBeInTheDocument();
  });

  it("always refreshes lifecycle data from the indexer", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "https://indexer.example");
    const requestOptions: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/markets") || url.endsWith("/challenges")) {
        requestOptions.push(init ?? {});
        return new Response(JSON.stringify([]));
      }
      return new Response("Not found", { status: 404 });
    }));

    renderWithProviders();

    await waitFor(() => expect(requestOptions).toHaveLength(2));
    expect(requestOptions.every((options) => options.cache === "no-store")).toBe(true);
  });

  it("shows create wizard and switches to Underworld mode", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Crear/i }));
    expect(screen.getByRole("button", { name: "Crear mercado" })).toBeInTheDocument();
    expect(screen.getByText("Revision antes de pagar")).toBeInTheDocument();
    expect(screen.getByText("Este bond se bloquea al crear el mercado. Se devuelve si el creador cumple las reglas; se puede slashear por fraude o abuso.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vanilla/i }));
    await user.click(screen.getByRole("button", { name: /Creator Center/i }));

    expect(screen.getByRole("button", { name: /Underworld/i })).toBeInTheDocument();
    expect(screen.getByText("Underworld exige mas garantia porque el riesgo de abuso es mayor.")).toBeInTheDocument();
    expect(screen.getByText("7.5 aUSDT")).toBeInTheDocument();
  });

  it("shows a direct crypto deposit section without requiring a transaction", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Mi saldo/i }));

    expect(screen.getByText("Recibir fondos en Alterford")).toBeInTheDocument();
    expect(screen.getByText("Esta es la unica direccion receptora de esta cuenta.")).toBeInTheDocument();
    expect(screen.getByLabelText("Direccion receptora de tu cuenta Alterford")).toBeInTheDocument();
    expect(screen.getByText("Contrato aUSDT (dato tecnico, no enviar fondos aqui)")).toBeInTheDocument();
    expect(screen.getByText(/Saldo para gas:/i)).toBeInTheDocument();
    expect(screen.getByText(/ETH de Base Sepolia es gas/i)).toBeInTheDocument();
  });

  it("shows non-custodial XMR conversion only when the gateway enables it", async () => {
    vi.stubEnv("VITE_GATEWAY_URL", "https://gateway.example");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/v1/xmr/capabilities")) {
        return new Response(JSON.stringify({
          enabled: true,
          available: true,
          provider: "sideshift",
          assistedThresholdMinor: "1500000000",
          settlementChainId: 84532,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        chainId: 84532,
        challengeFactory: "0x1111111111111111111111111111111111111111",
        forwarder: "0x2222222222222222222222222222222222222222",
        relayEnabled: false,
        fiatEnabled: false,
      }), { status: 200 });
    }));
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Mi saldo/i }));

    await waitFor(() => expect(screen.getByText("Entrar con Monero")).toBeInTheDocument());
    expect(screen.queryByText("Comprar cripto")).not.toBeInTheDocument();
    expect(screen.getByText(/recibes USDC real directamente en tu wallet Base/i)).toBeInTheDocument();
    expect(screen.queryByText("Depositar Monero")).not.toBeInTheDocument();
  });

  it("shows Underworld challenges with moderation and escrow messaging", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const modeButton = screen.queryByRole("button", { name: /Vanilla/i });
    if (modeButton) {
      await user.click(modeButton);
    }
    await user.click(screen.getByRole("button", { name: /Retos/i }));

    expect(screen.getByText("Underworld Gateway / No apto para sensibles")).toBeInTheDocument();
    expect(screen.getByText("Retos Underworld")).toBeInTheDocument();
    expect(screen.getByText("Crear reto protegido")).toBeInTheDocument();
    expect(screen.getByText("Creador bloquea recompensa + bond.")).toBeInTheDocument();
    expect(screen.getByText("Ejecutor acepta con otra wallet y bloquea bond.")).toBeInTheDocument();
    expect(screen.getByText("La resolucion paga la recompensa menos fee variable de 4% a 10% o reembolsa si no se cumple.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear reto Underworld/i })).toBeDisabled();
    expect(screen.getByText("Total a bloquear al crear: 110 aUSDT")).toBeInTheDocument();
    expect(screen.getByText("Selecciona un reto")).toBeInTheDocument();
    expect(screen.getByText(/Solo apareceran las acciones validas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir disputa" })).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Reto"));
    await user.type(screen.getByLabelText("Reto"), "Comer excremento por dinero");

    expect(screen.getByText("Reto revisable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear reto Underworld/i })).toBeDisabled();
  });

  it("moves cancelled and expired challenges out of the active list", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "https://indexer.example");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/markets")) return new Response(JSON.stringify([]));
      if (url.endsWith("/challenges")) {
        return new Response(JSON.stringify([
          {
            id: "1",
            creator: "0x0000000000000000000000000000000000000001",
            title: "Reto ya cancelado",
            description: "No debe presentarse como disponible.",
            rewardPool: "1000000",
            deadline: "1",
            state: "Cancelled",
            riskLevel: "Low",
          },
          {
            id: "2",
            creator: "0x0000000000000000000000000000000000000002",
            title: "Reto abierto pero vencido",
            description: "El deadline ya termino.",
            rewardPool: "2000000",
            deadline: "1",
            state: "Open",
            riskLevel: "Low",
          },
        ]));
      }
      return new Response("Not found", { status: 404 });
    }));
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Retos/i }));
    await waitFor(() => expect(screen.getByText("Historial (2)")).toBeInTheDocument());
    expect(screen.getByText("No hay retos disponibles para aceptar.")).toBeInTheDocument();
    await user.click(screen.getByText("Historial (2)"));
    expect(screen.getByText("Reto ya cancelado")).toBeInTheDocument();
    expect(screen.getByText("Reto abierto pero vencido")).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
  });

  it("blocks death or severe violence challenges in Underworld", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const modeButton = screen.queryByRole("button", { name: /Vanilla/i });
    if (modeButton) {
      await user.click(modeButton);
    }
    await user.click(screen.getByRole("button", { name: /Retos/i }));
    await user.clear(screen.getByLabelText("Reto"));
    await user.type(screen.getByLabelText("Reto"), "Pago 100 si alguien mata a otra persona");

    expect(screen.getByText("Reto bloqueado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear reto Underworld/i })).toBeDisabled();
  });
});

function renderWithProviders() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}
