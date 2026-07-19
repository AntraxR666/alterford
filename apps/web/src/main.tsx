import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AppProviders } from "./AppProviders";
import "./styles.css";

if (import.meta.env.DEV && !("toJSON" in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    configurable: true,
    value(this: bigint) {
      return this.toString();
    },
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
