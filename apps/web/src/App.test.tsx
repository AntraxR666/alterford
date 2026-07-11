import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { AppProviders } from "./AppProviders";

describe("Alterford PWA shell", () => {
  afterEach(() => {
    cleanup();
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
    expect(screen.getByText("10 aUSDT")).toBeInTheDocument();
  });

  it("shows a direct crypto deposit section without requiring a transaction", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    await user.click(screen.getByRole("button", { name: /Mi saldo/i }));

    expect(screen.getByText("Depositar cripto")).toBeInTheDocument();
    expect(screen.getByText("Recibir fondos no firma transacciones ni cobra gas.")).toBeInTheDocument();
    expect(screen.getByLabelText("Direccion de cuenta Alterford")).toBeInTheDocument();
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

    await user.clear(screen.getByLabelText("Reto"));
    await user.type(screen.getByLabelText("Reto"), "Comer excremento por dinero");

    expect(screen.getByText("Reto revisable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear reto Underworld/i })).toBeDisabled();
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
