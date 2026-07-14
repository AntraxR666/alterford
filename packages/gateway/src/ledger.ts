import { isAddress, type Address } from "viem";
import { PolicyViolation, type SponsoredChallengeAction } from "./policy.js";

interface LedgerConfig {
  globalDailyLimit: number;
  walletDailyLimit: number;
  ipHourlyLimit: number;
}

export interface Reservation {
  key: string;
  user: Address;
  ip: string;
  action: SponsoredChallengeAction;
  createdAt: number;
  taskId?: string;
}

export interface SponsorshipLedgerSnapshot {
  version: 1;
  reservations: Reservation[];
}

export class SponsorshipLedger {
  private readonly reservations = new Map<string, Reservation>();

  constructor(
    private readonly config: LedgerConfig,
    snapshot?: SponsorshipLedgerSnapshot,
    private readonly onChange?: (snapshot: SponsorshipLedgerSnapshot) => void,
  ) {
    for (const reservation of snapshot?.reservations ?? []) {
      if (validReservation(reservation)) this.reservations.set(reservation.key, { ...reservation });
    }
  }

  snapshot(): SponsorshipLedgerSnapshot {
    return { version: 1, reservations: [...this.reservations.values()].map((item) => ({ ...item })) };
  }

  taskFor(key: string) {
    const taskId = this.reservations.get(key)?.taskId;
    return taskId ? { taskId } : undefined;
  }

  reserve(
    key: string,
    user: Address,
    ip: string,
    action: SponsoredChallengeAction,
    now: number,
  ) {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      throw new PolicyViolation("INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    }
    if (this.reservations.has(key)) {
      throw new PolicyViolation("REQUEST_IN_PROGRESS", "This sponsored request is already in progress.");
    }

    const dayAgo = now - 86_400;
    const hourAgo = now - 3_600;
    for (const [reservationKey, reservation] of this.reservations) {
      if (reservation.createdAt <= dayAgo) this.reservations.delete(reservationKey);
    }
    const records = [...this.reservations.values()].filter((item) => item.createdAt > dayAgo);
    if (records.length >= this.config.globalDailyLimit) {
      throw new PolicyViolation("GLOBAL_BUDGET_EXHAUSTED", "The daily sponsorship budget is exhausted.");
    }
    if (records.filter((item) => item.user.toLowerCase() === user.toLowerCase()).length >= this.config.walletDailyLimit) {
      throw new PolicyViolation("WALLET_LIMIT", "This wallet reached its daily sponsorship limit.");
    }
    if (records.filter((item) => item.ip === ip && item.createdAt > hourAgo).length >= this.config.ipHourlyLimit) {
      throw new PolicyViolation("IP_LIMIT", "This client reached its hourly sponsorship limit.");
    }
    this.reservations.set(key, { key, user, ip, action, createdAt: now });
    this.persist();
  }

  commit(key: string, taskId: string) {
    const reservation = this.reservations.get(key);
    if (!reservation) throw new Error("Missing sponsorship reservation.");
    reservation.taskId = taskId;
    this.persist();
  }

  rollback(key: string) {
    this.reservations.delete(key);
    this.persist();
  }

  private persist() {
    this.onChange?.(this.snapshot());
  }
}

const actions = new Set<SponsoredChallengeAction>([
  "createChallenge",
  "acceptChallenge",
  "updateLiveStreamURI",
  "submitEvidence",
  "proposeResolution",
  "confirmResolution",
  "disputeResolution",
  "finalizeUndisputed",
]);

function validReservation(value: Reservation) {
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value.key)
    && isAddress(value.user)
    && typeof value.ip === "string"
    && actions.has(value.action)
    && Number.isSafeInteger(value.createdAt)
    && (!value.taskId || typeof value.taskId === "string");
}
