import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { useAppStore } from "./stores/appStore";

describe("Alterford PWA shell", () => {
  beforeEach(() => {
    useAppStore.setState({
      isUnderworldMode: false,
      quickBetAmount: 500_000n,
      highRollerMode: false,
      approvalMode: "smart",
    });
    vi.stubEnv("VITE_GATEWAY_URL", "");
    vi.stubEnv("VITE_INDEXER_URL", "https://indexer.example");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/markets")) return new Response(JSON.stringify([{
        id: "1",
        creator: "0x0000000000000000000000000000000000000001",
        title: "Mercado de prueba controlada",
        description: "Fixture aislada de la prueba de interfaz.",
        category: "Crypto",
        state: "Open",
        poolByOutcome: ["1000000", "3000000"],
        impliedOddsByOutcome: [25, 75],
        lockTime: String(Math.floor(Date.now() / 1_000) + 3_600),
        resolutionTime: String(Math.floor(Date.now() / 1_000) + 7_200),
      }]));
      if (url.endsWith("/challenges") || url.endsWith("/bounties")) return new Response(JSON.stringify([]));
      return new Response("Not found", { status: 404 });
    }));
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("explains the testnet product once and allows reopening the guide", async () => {
    const user = userEvent.setup();
    const view = renderWithProviders();

    expect(screen.getByText("Predice. Reta. Demuestra.")).toBeInTheDocument();
    expect(screen.getByText(/la plataforma nunca apuesta contra ti/i)).toBeInTheDocument();
    expect(screen.getByText(/no tienen valor real/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Entrar a Alterford" }));
    expect(screen.queryByText("Predice. Reta. Demuestra.")).not.toBeInTheDocument();

    view.unmount();
    renderWithProviders();
    expect(screen.queryByText("Predice. Reta. Demuestra.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guia rapida" }));
    expect(screen.getByText("Predice. Reta. Demuestra.")).toBeInTheDocument();
  });

  it("renders the user-friendly markets experience", async () => {
    renderWithProviders();

    await waitFor(() => expect(screen.getAllByText("Mercado de prueba controlada")).toHaveLength(2));

    expect(screen.getByRole("heading", { name: "Alterford" })).toBeInTheDocument();
    expect(screen.getByText("Conectar wallet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mercados/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retos/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bounties/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mi saldo/i })).toBeInTheDocument();
    expect(screen.getByText("Mercados activos")).toBeInTheDocument();
    expect(screen.getByText("Ticket de prediccion")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Si" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar prediccion/i })).toBeInTheDocument();
    expect(screen.getByText("Conectar y autorizar no apuestan. Solo se mueve aUSDT cuando presionas Confirmar prediccion y aceptas en la wallet.")).toBeInTheDocument();
  });

  it("offers bounded reusable permissions and an exact-per-operation alternative", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Mi saldo/i }));

    expect(screen.getByRole("button", { name: /Menos confirmaciones/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Permiso exacto/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/nunca es ilimitado/i)).toBeInTheDocument();
    expect(screen.getAllByText("Mercados").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Retos").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bounties").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Permiso exacto/i }));
    expect(useAppStore.getState().approvalMode).toBe("exact");
  });

  it("exposes the indexed bounty lifecycle without operator controls for participants", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "https://indexer.example");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/markets") || url.endsWith("/challenges")) return new Response(JSON.stringify([]));
      if (url.endsWith("/bounties")) return new Response(JSON.stringify([{
        id: "4",
        bountyId: "4",
        creator: "0x0000000000000000000000000000000000000001",
        title: "Crear el mejor clip viral",
        description: "Publica una evidencia verificable.",
        rewardPool: "50000000",
        rewardEscrow: "50000000",
        deadline: String(Math.floor(Date.now() / 1000) + 3600),
        state: "Open",
        modeAffinity: "Vanilla",
        submissions: [],
      }]));
      return new Response("Not found", { status: 404 });
    }));
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Bounties/i }));
    await waitFor(() => expect(screen.getByText("Crear el mejor clip viral")).toBeInTheDocument());
    expect(screen.getByText(/Entrega cierra en/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explorar bounties/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Mis entregas/ })).toBeInTheDocument();
    expect(screen.queryByText("Crear bounty protegido")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Crear bounty/ }));
    expect(screen.getByText("Crear bounty protegido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resolver bounty/i })).not.toBeInTheDocument();
  }, 10_000);

  it("keeps Vanilla and Underworld bounties in separate visible cohorts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/markets") || url.endsWith("/challenges")) return new Response(JSON.stringify([]));
      if (url.endsWith("/bounties")) return new Response(JSON.stringify([
        {
          id: "1", creator: "0x0000000000000000000000000000000000000001",
          title: "Bounty Vanilla", description: "Visible solo en Vanilla.", rewardPool: "1000000",
          rewardEscrow: "1000000", deadline: String(Math.floor(Date.now() / 1000) + 3600),
          state: "Open", modeAffinity: "Vanilla", submissions: [],
        },
        {
          id: "2", creator: "0x0000000000000000000000000000000000000002",
          title: "Bounty Underworld", description: "Visible solo en Underworld.", rewardPool: "2000000",
          rewardEscrow: "2000000", deadline: String(Math.floor(Date.now() / 1000) + 3600),
          state: "Open", modeAffinity: "Underworld", submissions: [],
        },
      ]));
      return new Response("Not found", { status: 404 });
    }));
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Bounties/i }));
    await waitFor(() => expect(screen.getByText("Bounty Vanilla")).toBeInTheDocument());
    expect(screen.queryByText("Bounty Underworld")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vanilla" }));
    await waitFor(() => expect(screen.getByText("Bounty Underworld")).toBeInTheDocument());
    expect(screen.queryByText("Bounty Vanilla")).not.toBeInTheDocument();
  });

  it("keeps the trade ticket mounted when selecting larger quick bet amounts", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await waitFor(() => expect(screen.getAllByText("Mercado de prueba controlada")).toHaveLength(2));

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
      if (url.endsWith("/challenges") || url.endsWith("/bounties")) return new Response(JSON.stringify([]));
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
      if (url.endsWith("/markets") || url.endsWith("/challenges") || url.endsWith("/bounties")) {
        requestOptions.push(init ?? {});
        return new Response(JSON.stringify([]));
      }
      return new Response("Not found", { status: 404 });
    }));

    renderWithProviders();

    await waitFor(() => expect(requestOptions).toHaveLength(3));
    expect(requestOptions.every((options) => options.cache === "no-store")).toBe(true);
  });

  it("shows create wizard and switches to Underworld mode", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Crear/i }));
    expect(screen.getByRole("button", { name: "Crear mercado" })).toBeInTheDocument();
    expect(screen.getByText("Revision antes de pagar")).toBeInTheDocument();
    expect(screen.getByText("Este bond se bloquea al crear el mercado. Se devuelve si el creador cumple las reglas; se puede slashear por fraude o abuso.")).toBeInTheDocument();

    const vanillaMode = screen.queryByRole("button", { name: /Vanilla/i });
    if (vanillaMode) await user.click(vanillaMode);
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
      if (url.endsWith("/markets") || url.endsWith("/challenges") || url.endsWith("/bounties")) {
        return new Response(JSON.stringify([]));
      }
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
    expect(screen.getByRole("button", { name: /Explorar retos/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Mis retos/ })).toBeInTheDocument();
    expect(screen.queryByText("Crear reto protegido")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Crear reto/ }));
    expect(screen.getByText("Crear reto protegido")).toBeInTheDocument();
    expect(screen.getByText("La wallet conectada sera el creador")).toBeInTheDocument();
    expect(screen.getByText(/Autorizar no mueve aUSDT/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wallet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Ruta Wallet lista/i)).toBeInTheDocument();
    expect(screen.getByText("Creador bloquea recompensa + bond.")).toBeInTheDocument();
    expect(screen.getByText("Ejecutor acepta con otra wallet y bloquea bond.")).toBeInTheDocument();
    expect(screen.getByText("La resolucion paga la recompensa menos fee variable de 4% a 10% o reembolsa si no se cumple.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear reto con Wallet/i })).toBeDisabled();
    expect(screen.getByText("Total a bloquear al crear: 110 aUSDT")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Explorar retos/ }));
    expect(screen.getByText("Selecciona un reto")).toBeInTheDocument();
    expect(screen.getByText(/Solo apareceran las acciones validas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir disputa" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Crear reto/ }));
    await user.clear(screen.getByLabelText("Reto"));
    await user.type(screen.getByLabelText("Reto"), "Comer excremento por dinero");

    expect(screen.getByText("Reto revisable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear reto con Wallet/i })).toBeDisabled();
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
            modeAffinity: "Vanilla",
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
            modeAffinity: "Vanilla",
          },
        ]));
      }
      if (url.endsWith("/bounties")) return new Response(JSON.stringify([]));
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

  it("shows participants a waiting state instead of market resolution controls", async () => {
    vi.stubEnv("VITE_INDEXER_URL", "https://indexer.example");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/markets")) return new Response(JSON.stringify([{
        id: "9",
        creator: "0x0000000000000000000000000000000000000001",
        title: "Mercado listo para resolver",
        description: "El operador debe publicar el resultado.",
        category: "News",
        state: "Open",
        poolByOutcome: ["1000000", "1000000"],
        lockTime: "1",
        resolutionTime: "1",
      }]));
      if (url.endsWith("/challenges") || url.endsWith("/bounties")) return new Response(JSON.stringify([]));
      return new Response("Not found", { status: 404 });
    }));
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Creator Center/i }));
    await waitFor(() => expect(screen.getByText(/Esperando resolucion del operador/)).toBeInTheDocument());
    expect(screen.queryByLabelText("Resultado del mercado 9")).not.toBeInTheDocument();
  });

  it("blocks death or severe violence challenges in Underworld", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const modeButton = screen.queryByRole("button", { name: /Vanilla/i });
    if (modeButton) {
      await user.click(modeButton);
    }
    await user.click(screen.getByRole("button", { name: /Retos/i }));
    await user.click(screen.getByRole("button", { name: /Crear reto/ }));
    await user.clear(screen.getByLabelText("Reto"));
    await user.type(screen.getByLabelText("Reto"), "Pago 100 si alguien mata a otra persona");

    expect(screen.getByText("Reto bloqueado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear reto con Wallet/i })).toBeDisabled();
  });
});

function renderWithProviders() {
  return render(
    <AppProviders>
      <App />
    </AppProviders>,
  );
}
