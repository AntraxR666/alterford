import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileCheck,
  Flame,
  Gauge,
  History,
  LockKeyhole,
  PlusCircle,
  ShieldCheck,
  Siren,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards,
  Zap,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { isAddress } from "viem";
import {
  DEFAULT_BOND_POLICY,
  DEFAULT_ECONOMICS,
  HIGH_ROLLER_AMOUNTS_USDT,
  QUICK_BET_AMOUNTS_USDT,
  calculateCreationBond,
  calculateMarketSettlement,
  formatUsdt,
  type ChallengeDTO,
  type MarketDTO,
} from "@alterford/sdk";
import { sampleMarkets } from "./features/markets/sampleMarkets";
import { useIndexerFeed } from "./hooks/useIndexerFeed";
import { useWeb3Flow } from "./hooks/useWeb3Flow";
import { useAppStore } from "./stores/appStore";

type TabId = "markets" | "challenges" | "create" | "portfolio" | "creator";
type MarketViewModel = {
  id: string;
  title: string;
  description: string;
  category: string;
  state: string;
  yesOdds: number;
  noOdds: number;
  poolByOutcome: readonly bigint[];
};

type MarketQuoteView = ReturnType<typeof calculateMarketSettlement> & {
  sameSidePoolBefore: bigint;
  counterPoolBefore: bigint;
  totalPoolAfter: bigint;
  netProfit: bigint;
  loss: bigint;
};

const tabs: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: "markets", label: "Mercados", icon: <Gauge size={16} /> },
  { id: "challenges", label: "Retos", icon: <Flame size={16} /> },
  { id: "create", label: "Crear", icon: <PlusCircle size={16} /> },
  { id: "portfolio", label: "Mi saldo", icon: <WalletCards size={16} /> },
  { id: "creator", label: "Creator Center", icon: <BarChart3 size={16} /> },
];

const categories = ["Crypto", "Deportes", "Tecnologia", "Noticias", "Cultura", "Underworld"];
const challengeTemplates = [
  {
    title: "Tatuaje bajo voto de comunidad",
    reward: "100 aUSDT",
    risk: "Alto",
    status: "Permitido con evidencia y consentimiento",
    evidence: "Video continuo, timestamp, identidad del ejecutor y prueba final verificable.",
  },
  {
    title: "Reto viral con entrega publica",
    reward: "50 aUSDT",
    risk: "Medio",
    status: "Permitido si no hay dano fisico, acoso ni ilegalidad",
    evidence: "Prueba en video, enlace publico y ventana de disputa de 24h.",
  },
  {
    title: "Tabu / biohazard / humillacion extrema",
    reward: "Variable",
    risk: "Alto",
    status: "Permitido con evidencia reforzada",
    evidence: "Debe incluir consentimiento, prueba verificable, ventana de disputa y reglas claras.",
  },
];

const underworldProofSteps = [
  "Creador bloquea recompensa + bond.",
  "Ejecutor acepta con otra wallet y bloquea bond.",
  "Live/evidencia se publica antes del deadline.",
  "Arbitro resuelve: paga, reembolsa o slashea bond.",
];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("markets");
  const [createQuestion, setCreateQuestion] = useState("ETH cerrara sobre $4,000 esta semana?");
  const [createCategory, setCreateCategory] = useState("Crypto");
  const [closesInMinutes, setClosesInMinutes] = useState(60);
  const [resolvesInMinutes, setResolvesInMinutes] = useState(120);
  const [selectedMarketId, setSelectedMarketId] = useState("1");
  const [challengeTitle, setChallengeTitle] = useState("Me tatuo el texto elegido por la comunidad");
  const [challengeStake, setChallengeStake] = useState("100");
  const [challengeEvidence, setChallengeEvidence] = useState("Video continuo, timestamp y verificacion del resultado final");
  const [challengeLiveUrl, setChallengeLiveUrl] = useState("");
  const [challengeActionId, setChallengeActionId] = useState("1");
  const [challengeEvidenceUrl, setChallengeEvidenceUrl] = useState("");
  const [challengeDisputeReason, setChallengeDisputeReason] = useState("");
  const [challengeDeadline, setChallengeDeadline] = useState(1440);
  const {
    isUnderworldMode,
    quickBetAmount,
    highRollerMode,
    toggleUnderworldMode,
    setQuickBetAmount,
    setHighRollerMode,
  } = useAppStore();
  const indexer = useIndexerFeed();
  const bondEstimate = calculateCreationBond({
    entityType: "Market",
    mode: isUnderworldMode ? "Underworld" : "Vanilla",
    creatorTier: "Basic",
    categoryRisk: isUnderworldMode ? "High" : "Low",
    reputation: "New",
    expectedVolumeUsdt: isUnderworldMode ? 500_000_000n : 20_000_000n,
    disputeCount: isUnderworldMode ? 1 : 0,
    fraudCount: 0,
    policy: DEFAULT_BOND_POLICY,
  });
  const challengeStakeAmount = parseUsdtInput(challengeStake);
  const challengeRiskLevel = isUnsafeChallenge(challengeTitle, challengeEvidence) ? "Critical" : "Medium";
  const challengeBondEstimate = calculateCreationBond({
    entityType: "Challenge",
    mode: "Underworld",
    creatorTier: "Basic",
    categoryRisk: challengeRiskLevel,
    reputation: "New",
    expectedVolumeUsdt: challengeStakeAmount,
    disputeCount: challengeRiskLevel === "Critical" ? 2 : 1,
    fraudCount: 0,
    policy: DEFAULT_BOND_POLICY,
  });
  const web3 = useWeb3Flow(bondEstimate, quickBetAmount, isUnderworldMode, challengeBondEstimate, challengeStakeAmount);
  const markets = useMemo(() => mergeMarkets(indexer.markets, sampleMarkets), [indexer.markets]);
  const marketViews = useMemo(() => markets.map(toMarketViewModel), [markets]);
  const selectedMarketView = marketViews.find((market) => market.id === selectedMarketId) ?? marketViews[0];
  const quote = useMemo(
    () => calculateSelectedMarketQuote(selectedMarketView?.poolByOutcome, web3.selectedOutcome, quickBetAmount),
    [quickBetAmount, selectedMarketView?.poolByOutcome, web3.selectedOutcome],
  );
  const visualUnderworldMode = isUnderworldMode || activeTab === "challenges";
  const modeClass = visualUnderworldMode ? "underworld" : "vanilla";
  const quickBetAmountLabel = formatUsdt(quickBetAmount);
  const quotePayoutLabel = formatUsdt(quote.userPayout);
  const quoteNetProfitLabel = formatUsdt(quote.netProfit);
  const quoteLossLabel = formatUsdt(quote.loss);
  const quoteCounterPoolLabel = formatUsdt(quote.counterPoolBefore);
  const quoteSameSidePoolLabel = formatUsdt(quote.sameSidePoolBefore);
  const quoteTotalPoolLabel = formatUsdt(quote.totalPoolAfter);
  const quoteMultipleLabel = formatPayoutMultiple(quote.userPayout, quickBetAmount);
  const bondAmountLabel = formatUsdt(bondEstimate.amount);
  const challengeBondAmountLabel = formatUsdt(challengeBondEstimate.amount);
  const challengeStakeLabel = formatUsdt(challengeStakeAmount);
  const challengeTotalRequiredLabel = formatUsdt(challengeBondEstimate.amount + challengeStakeAmount);
  const moderation = getChallengeModeration(challengeTitle, challengeEvidence);
  const preferredConnectorName = web3.preferredConnectorName || "wallet";

  function chooseMarket(market: MarketDTO) {
    setSelectedMarketId(market.id);
    web3.setMarketId(market.id);
    setActiveTab("markets");
  }

  function chooseMarketById(marketId: string) {
    const market = markets.find((item) => item.id === marketId);
    if (market) {
      chooseMarket(market);
    }
  }

  function createMarket() {
    web3.createMarket({
      question: createQuestion,
      category: createCategory,
      closesInMinutes,
      resolvesInMinutes,
    });
  }

  return (
    <main className={`app-shell ${modeClass}`}>
      <header className="app-header">
        <div>
          <p className="eyebrow">Base Sepolia / No house risk</p>
          <h1>Alterford</h1>
        </div>
        <div className="header-actions">
          <button className="mode-switch" onClick={toggleUnderworldMode}>
            {visualUnderworldMode ? <Flame size={16} /> : <Sparkles size={16} />}
            {visualUnderworldMode ? "Underworld" : "Vanilla"}
          </button>
          {web3.account.isConnected ? (
            <button className="wallet-button" onClick={() => web3.disconnect()}>
              <WalletCards size={16} /> {web3.accountLabel}
            </button>
          ) : (
            <button className="wallet-button primary" onClick={web3.connectWallet} disabled={web3.isConnecting}>
              <WalletCards size={16} />
              {web3.isConnecting ? "Conectando" : `Conectar ${preferredConnectorName}`}
            </button>
          )}
        </div>
      </header>

      <section className="status-strip">
        <StatusItem icon={<CheckCircle2 size={17} />} label="Conectar wallet" value="Gratis" />
        <StatusItem icon={<WalletCards size={17} />} label="Saldo" value={web3.balanceLabel} />
        <StatusItem icon={<ShieldCheck size={17} />} label="Autorizado" value={web3.allowanceLabel} />
        <StatusItem icon={<Bell size={17} />} label="Indexer" value={`${indexer.status} / ${indexer.marketCount}`} />
      </section>

      {!web3.onTargetChain && web3.account.isConnected && (
        <section className="network-warning">
          <strong>Estas en otra red.</strong>
          <span>Alterford testnet usa Base Sepolia. Si la wallet no cambia sola, abre MetaMask y selecciona Base Sepolia manualmente.</span>
          <button onClick={web3.switchToTargetChain} disabled={web3.isSwitching}>
            {web3.isSwitching ? "Cambiando red" : "Cambiar o agregar Base Sepolia"}
          </button>
        </section>
      )}

      <nav className="app-tabs" aria-label="Alterford sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>

      {visualUnderworldMode && <UnderworldGateway />}

      {activeTab === "markets" && (
        <MarketsView
          markets={marketViews}
          selectedMarket={selectedMarketView}
          quickBetAmount={quickBetAmount}
          quickBetAmountLabel={quickBetAmountLabel}
          highRollerMode={highRollerMode}
          quotePayoutLabel={quotePayoutLabel}
          quoteNetProfitLabel={quoteNetProfitLabel}
          quoteLossLabel={quoteLossLabel}
          quoteCounterPoolLabel={quoteCounterPoolLabel}
          quoteSameSidePoolLabel={quoteSameSidePoolLabel}
          quoteTotalPoolLabel={quoteTotalPoolLabel}
          quoteMultipleLabel={quoteMultipleLabel}
          balance={web3.balance}
          selectedOutcome={web3.selectedOutcome}
          needsApproval={web3.needsBetApproval}
          hasEnoughBalance={web3.hasEnoughBetBalance}
          tx={web3.tx}
          onSelectMarket={chooseMarketById}
          onSelectOutcome={web3.setSelectedOutcome}
          onQuickAmount={setQuickBetAmount}
          onToggleHighRoller={() => setHighRollerMode(!highRollerMode)}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveSettlement}
          onBet={web3.placeBet}
        />
      )}

      {activeTab === "challenges" && (
        <ChallengesView
          title={challengeTitle}
          indexedChallenges={indexer.challenges}
          stake={challengeStake}
          stakeLabel={challengeStakeLabel}
          evidence={challengeEvidence}
          liveUrl={challengeLiveUrl}
          actionId={challengeActionId}
          evidenceUrl={challengeEvidenceUrl}
          disputeReason={challengeDisputeReason}
          deadline={challengeDeadline}
          bondAmountLabel={challengeBondAmountLabel}
          totalRequiredLabel={challengeTotalRequiredLabel}
          bondReasons={challengeBondEstimate.reasons}
          moderation={moderation}
          needsApproval={web3.needsChallengeApproval}
          hasEnoughBalance={web3.hasEnoughChallengeBalance}
          tx={web3.tx}
          onTitle={setChallengeTitle}
          onStake={setChallengeStake}
          onEvidence={setChallengeEvidence}
          onLiveUrl={setChallengeLiveUrl}
          onActionId={setChallengeActionId}
          onEvidenceUrl={setChallengeEvidenceUrl}
          onDisputeReason={setChallengeDisputeReason}
          onDeadline={setChallengeDeadline}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveChallengeSettlement}
          onApproveExecutor={() => web3.approveChallengeExecutorBond()}
          onApproveDispute={() => web3.approveChallengeDispute({ challengeId: challengeActionId })}
          onCreate={() =>
            web3.createChallenge({
              title: challengeTitle,
              stakeUsdt: challengeStakeAmount,
              evidence: challengeEvidence,
              liveStreamURI: challengeLiveUrl,
              deadlineMinutes: challengeDeadline,
              riskLevel: challengeRiskLevel,
            })
          }
          onAccept={() => web3.acceptChallenge({ challengeId: challengeActionId, liveStreamURI: challengeLiveUrl })}
          onUpdateLive={() => web3.updateChallengeLiveStream({ challengeId: challengeActionId, liveStreamURI: challengeLiveUrl })}
          onSubmitEvidence={() =>
            web3.submitChallengeEvidence({
              challengeId: challengeActionId,
              liveStreamURI: challengeLiveUrl,
              evidenceURI: challengeEvidenceUrl,
            })
          }
          onPropose={(executorSucceeded) =>
            web3.proposeChallengeResolution({
              challengeId: challengeActionId,
              executorSucceeded,
              evidenceURI: challengeEvidenceUrl,
              liveStreamURI: challengeLiveUrl,
            })
          }
          onConfirm={(executorSucceeded) =>
            web3.confirmChallengeResolution({ challengeId: challengeActionId, executorSucceeded })
          }
          onDispute={() =>
            web3.disputeChallengeResolution({
              challengeId: challengeActionId,
              reason: challengeDisputeReason,
            })
          }
          onFinalize={() => web3.finalizeUndisputedChallenge({ challengeId: challengeActionId })}
          onResolveDispute={(executorSucceeded) =>
            web3.resolveChallengeDispute({
              challengeId: challengeActionId,
              executorSucceeded,
              reason: challengeDisputeReason,
            })
          }
        />
      )}

      {activeTab === "create" && (
        <CreateView
          question={createQuestion}
          category={createCategory}
          closesInMinutes={closesInMinutes}
          resolvesInMinutes={resolvesInMinutes}
          bondAmountLabel={bondAmountLabel}
          bondReasons={bondEstimate.reasons}
          needsApproval={web3.needsCreateApproval}
          hasEnoughBalance={web3.hasEnoughCreateBalance}
          tx={web3.tx}
          onQuestion={setCreateQuestion}
          onCategory={setCreateCategory}
          onCloses={setClosesInMinutes}
          onResolves={setResolvesInMinutes}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveSettlement}
          onCreate={createMarket}
        />
      )}

      {activeTab === "portfolio" && (
        <PortfolioView
          accountLabel={web3.accountLabel}
          depositAddress={web3.account.address}
          desiredChainId={web3.desiredChainId}
          settlementToken={web3.addresses.settlementToken}
          balanceLabel={web3.balanceLabel}
          allowanceLabel={web3.allowanceLabel}
          marketId={web3.marketId}
          tx={web3.tx}
          onMarketId={web3.setMarketId}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveSettlement}
          onClaim={web3.claimReward}
          onRefund={web3.claimRefund}
        />
      )}

      {activeTab === "creator" && (
        <CreatorView
          isUnderworldMode={isUnderworldMode}
          bondAmountLabel={bondAmountLabel}
          bondReasons={bondEstimate.reasons}
          indexerStatus={indexer.status}
          marketCount={indexer.marketCount}
          onToggleMode={toggleUnderworldMode}
          onResolve={web3.resolveMarket}
          tx={web3.tx}
        />
      )}
    </main>
  );
}

function MarketsView({
  markets,
  selectedMarket,
  quickBetAmount,
  quickBetAmountLabel,
  highRollerMode,
  quotePayoutLabel,
  quoteNetProfitLabel,
  quoteLossLabel,
  quoteCounterPoolLabel,
  quoteSameSidePoolLabel,
  quoteTotalPoolLabel,
  quoteMultipleLabel,
  balance,
  selectedOutcome,
  needsApproval,
  hasEnoughBalance,
  tx,
  onSelectMarket,
  onSelectOutcome,
  onQuickAmount,
  onToggleHighRoller,
  onAddFunds,
  onApprove,
  onBet,
}: {
  markets: MarketViewModel[];
  selectedMarket?: MarketViewModel;
  quickBetAmount: bigint;
  quickBetAmountLabel: string;
  highRollerMode: boolean;
  quotePayoutLabel: string;
  quoteNetProfitLabel: string;
  quoteLossLabel: string;
  quoteCounterPoolLabel: string;
  quoteSameSidePoolLabel: string;
  quoteTotalPoolLabel: string;
  quoteMultipleLabel: string;
  balance: bigint;
  selectedOutcome: 0 | 1;
  needsApproval: boolean;
  hasEnoughBalance: boolean;
  tx: { status: string; label: string; hash?: string; error?: string };
  onSelectMarket: (marketId: string) => void;
  onSelectOutcome: (outcome: 0 | 1) => void;
  onQuickAmount: (amount: bigint) => void;
  onToggleHighRoller: () => void;
  onAddFunds: () => void;
  onApprove: () => void;
  onBet: () => void;
}) {
  const amountOptions = highRollerMode ? HIGH_ROLLER_AMOUNTS_USDT : QUICK_BET_AMOUNTS_USDT;
  const hasCounterLiquidity = quoteCounterPoolLabel !== "0";

  return (
    <section className="product-grid">
      <div className="market-feed">
        <div className="section-title">
          <div>
            <p className="eyebrow">Explorar</p>
            <h2>Mercados activos</h2>
          </div>
          <span>{markets.length} disponibles</span>
        </div>
        {markets.map((market) => (
          <button
            className={selectedMarket?.id === market.id ? "market-row selected" : "market-row"}
            key={market.id}
            onClick={() => onSelectMarket(market.id)}
          >
            <div>
              <p className="eyebrow">{market.category} / {market.state}</p>
              <h3>{market.title}</h3>
              <span>{market.description}</span>
              <div className="market-card-meta">
                <small>ID #{market.id}</small>
                <small>Pool {formatUsdt((market.poolByOutcome[0] ?? 0n) + (market.poolByOutcome[1] ?? 0n))} aUSDT</small>
              </div>
            </div>
            <div className="market-odds">
              <strong>SI {market.yesOdds}%</strong>
              <strong>NO {market.noOdds}%</strong>
            </div>
          </button>
        ))}
      </div>

      <aside className="trade-ticket">
        <p className="eyebrow">Ticket de prediccion</p>
        <h2>{selectedMarket?.title ?? "Selecciona un mercado"}</h2>
        <p className="help-text">Conectar y autorizar no apuestan. Solo se mueve aUSDT cuando presionas Confirmar prediccion y aceptas en la wallet.</p>
        <div className="yes-no">
          <button className={selectedOutcome === 0 ? "selected yes" : "yes"} onClick={() => onSelectOutcome(0)}>
            Si
          </button>
          <button className={selectedOutcome === 1 ? "selected no" : "no"} onClick={() => onSelectOutcome(1)}>
            No
          </button>
        </div>
        <div className="amount-row">
          {amountOptions.map((amount) => (
            <button
              className={quickBetAmount === amount ? "selected" : ""}
              key={amount.toString()}
              onClick={() => onQuickAmount(amount)}
            >
              {formatUsdt(amount)}
            </button>
          ))}
          {highRollerMode && (
            <button
              className={quickBetAmount === balance && balance > 0n ? "selected" : ""}
              onClick={() => onQuickAmount(balance)}
              disabled={balance <= 0n}
            >
              ALL IN
            </button>
          )}
        </div>
        <button className="text-link" onClick={onToggleHighRoller}>
          {highRollerMode ? "Volver a montos rapidos" : "Modo High Roller"}
        </button>
        <div className="payout-hero">
          <span>Ganancia neta estimada si aciertas</span>
          <strong>{quoteNetProfitLabel} aUSDT</strong>
          <small>{hasCounterLiquidity ? "Sale del pool del lado contrario, menos fee." : "Ahora no hay dinero del lado contrario; si ganas, recuperas tu stake pero el profit neto puede ser 0."}</small>
        </div>
        <div className="cost-box">
          <span>Costo al apostar</span>
          <strong>{quickBetAmountLabel} aUSDT</strong>
          <span>Recibes total si ganas</span>
          <strong>{quotePayoutLabel} aUSDT</strong>
          <span>Multiplicador estimado</span>
          <strong>{quoteMultipleLabel}</strong>
          <span>Riesgo si pierdes</span>
          <strong>{quoteLossLabel} aUSDT</strong>
          <small>El retorno total incluye tu apuesta original. La ganancia real es el profit neto mostrado arriba.</small>
        </div>
        <PayoutExplainer
          selectedOutcome={selectedOutcome}
          sameSidePool={quoteSameSidePoolLabel}
          counterPool={quoteCounterPoolLabel}
          totalPool={quoteTotalPoolLabel}
        />
        <StepLine done={hasEnoughBalance} label="Tienes aUSDT suficiente para esta prediccion" action="Recibir aUSDT testnet" onAction={onAddFunds} />
        <StepLine done={!needsApproval} label="Alterford esta autorizado para esta prediccion" action="Autorizar aUSDT" onAction={onApprove} />
        <button className="primary-action" onClick={onBet} disabled={!hasEnoughBalance || needsApproval}>
          Confirmar prediccion <ChevronRight size={16} />
        </button>
        <TxState tx={tx} />
      </aside>
    </section>
  );
}

function PayoutExplainer({
  selectedOutcome,
  sameSidePool,
  counterPool,
  totalPool,
}: {
  selectedOutcome: 0 | 1;
  sameSidePool: string;
  counterPool: string;
  totalPool: string;
}) {
  const side = selectedOutcome === 0 ? "SI" : "NO";
  return (
    <div className="payout-explainer">
      <div>
        <strong>Como se calcula</strong>
        <span>Tu profit no sale de Alterford; sale del pool del lado contrario si tu lado gana.</span>
      </div>
      <dl>
        <div>
          <dt>Tu lado ({side}) antes</dt>
          <dd>{sameSidePool} aUSDT</dd>
        </div>
        <div>
          <dt>Lado contrario</dt>
          <dd>{counterPool} aUSDT</dd>
        </div>
        <div>
          <dt>Pool despues de tu apuesta</dt>
          <dd>{totalPool} aUSDT</dd>
        </div>
      </dl>
    </div>
  );
}

function UnderworldGateway() {
  return (
    <section className="underworld-gateway" aria-label="Underworld gateway">
      <div>
        <p className="eyebrow">Underworld Gateway / No apto para sensibles</p>
        <h2>Retos, bounties y mercados virales con escrow antes de la accion.</h2>
        <span>Tabu social permitido con consentimiento, live proof y evidencia. Bloqueo minimo: muerte, dano grave, coercion, menores o violencia real.</span>
      </div>
      <div className="gateway-pulse">
        <Siren size={22} />
        <strong>Escrow + evidencia</strong>
      </div>
    </section>
  );
}

function LiveProofPreview({ liveUrl, evidenceUrl }: { liveUrl: string; evidenceUrl: string }) {
  const liveReady = liveUrl.trim().startsWith("http");
  const evidenceReady = evidenceUrl.trim().length > 0;
  return (
    <div className="live-proof-preview">
      <div className={liveReady ? "live-proof-item ready" : "live-proof-item"}>
        <Eye size={17} />
        <div>
          <strong>{liveReady ? "Live listo" : "Live opcional pendiente"}</strong>
          <span>{liveReady ? "El enlace se puede publicar on-chain para seguimiento en vivo." : "Puede ser YouTube, Twitch, Kick, X o cualquier URL publica."}</span>
        </div>
      </div>
      <div className={evidenceReady ? "live-proof-item ready" : "live-proof-item"}>
        <FileCheck size={17} />
        <div>
          <strong>{evidenceReady ? "Evidencia final lista" : "Evidencia final despues del reto"}</strong>
          <span>{evidenceReady ? "Se enviara como referencia verificable del resultado." : "Se completa cuando el ejecutor termina y sube prueba."}</span>
        </div>
      </div>
    </div>
  );
}

function ChallengesView({
  title,
  indexedChallenges,
  stake,
  stakeLabel,
  evidence,
  liveUrl,
  actionId,
  evidenceUrl,
  disputeReason,
  deadline,
  bondAmountLabel,
  totalRequiredLabel,
  bondReasons,
  moderation,
  needsApproval,
  hasEnoughBalance,
  tx,
  onTitle,
  onStake,
  onEvidence,
  onLiveUrl,
  onActionId,
  onEvidenceUrl,
  onDisputeReason,
  onDeadline,
  onAddFunds,
  onApprove,
  onApproveExecutor,
  onApproveDispute,
  onCreate,
  onAccept,
  onUpdateLive,
  onSubmitEvidence,
  onPropose,
  onConfirm,
  onDispute,
  onFinalize,
  onResolveDispute,
}: {
  title: string;
  indexedChallenges: ChallengeDTO[];
  stake: string;
  stakeLabel: string;
  evidence: string;
  liveUrl: string;
  actionId: string;
  evidenceUrl: string;
  disputeReason: string;
  deadline: number;
  bondAmountLabel: string;
  totalRequiredLabel: string;
  bondReasons: readonly string[];
  moderation: { allowed: boolean; level: string; message: string };
  needsApproval: boolean;
  hasEnoughBalance: boolean;
  tx: { status: string; label: string; hash?: string; error?: string };
  onTitle: (value: string) => void;
  onStake: (value: string) => void;
  onEvidence: (value: string) => void;
  onLiveUrl: (value: string) => void;
  onActionId: (value: string) => void;
  onEvidenceUrl: (value: string) => void;
  onDisputeReason: (value: string) => void;
  onDeadline: (value: number) => void;
  onAddFunds: () => void;
  onApprove: () => void;
  onApproveExecutor: () => void;
  onApproveDispute: () => void;
  onCreate: () => void;
  onAccept: () => void;
  onUpdateLive: () => void;
  onSubmitEvidence: () => void;
  onPropose: (executorSucceeded: boolean) => void;
  onConfirm: (executorSucceeded: boolean) => void;
  onDispute: () => void;
  onFinalize: () => void;
  onResolveDispute: (executorSucceeded: boolean) => void;
}) {
  return (
    <section className="challenge-layout">
      <div className="challenge-feed">
        <div className="section-title">
          <div>
            <p className="eyebrow">Retos Underworld</p>
            <h2>Provocacion monetizada, pero con reglas verificables.</h2>
          </div>
          <span>Live-ready</span>
        </div>
        <div className="proof-strip">
          {underworldProofSteps.map((step, index) => (
            <div className="proof-step" key={step}>
              <strong>{index + 1}</strong>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <div className="challenge-cards">
          {indexedChallenges.map((challenge) => (
            <article className="challenge-card live-card" key={challenge.id}>
              <div className="challenge-card-top">
                <Flame size={18} />
                <strong>{challenge.state}</strong>
              </div>
              <h3>{challenge.title || `Reto #${challenge.id}`}</h3>
              <p>{challenge.description || challenge.metadataURI || "Reto creado por usuario con escrow on-chain."}</p>
              <div className="challenge-meta">
                <span>{formatUsdt(toBigIntAmount(challenge.rewardPool))} aUSDT</span>
                <span>ID #{challenge.id}</span>
                <button onClick={() => onActionId(challenge.id)}>Usar ID #{challenge.id}</button>
              </div>
              {challenge.liveStreamURI ? (
                <a className="live-link" href={challenge.liveStreamURI} target="_blank" rel="noreferrer">Ver live proof</a>
              ) : (
                <small>Live pendiente. El ejecutor puede publicarlo al aceptar.</small>
              )}
            </article>
          ))}
          {challengeTemplates.map((challenge) => (
            <article className={challenge.status === "No permitido" ? "challenge-card blocked" : "challenge-card"} key={challenge.title}>
              <div className="challenge-card-top">
                <Flame size={18} />
                <strong>{challenge.risk}</strong>
              </div>
              <h3>{challenge.title}</h3>
              <p>{challenge.evidence}</p>
              <div className="challenge-meta">
                <span>{challenge.reward}</span>
                <span>{challenge.status}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className="challenge-builder">
        <p className="eyebrow">Crear reto protegido</p>
        <h2>Define el reto antes de bloquear fondos.</h2>
        <p className="help-text">Crear un reto bloquea recompensa + bond. Aceptarlo exige otra wallet: el creador no puede aceptar su propio reto.</p>
        <label>
          Reto
          <textarea value={title} onChange={(event) => onTitle(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Valor declarado
            <input value={stake} onChange={(event) => onStake(event.target.value)} />
          </label>
          <label>
            Deadline en minutos
            <input
              type="number"
              min={30}
              max={Number(stake) >= 1000 ? 2880 : 1440}
              value={deadline}
              onChange={(event) => onDeadline(Number(event.target.value))}
            />
          </label>
        </div>
        <label>
          Evidencia obligatoria
          <textarea value={evidence} onChange={(event) => onEvidence(event.target.value)} />
        </label>
        <label>
          Live opcional
          <input
            value={liveUrl}
            onChange={(event) => onLiveUrl(event.target.value)}
            placeholder="https://youtube.com/live/... o https://twitch.tv/..."
          />
        </label>
        <LiveProofPreview liveUrl={liveUrl} evidenceUrl={evidenceUrl} />

        <div className={moderation.allowed ? "moderation-box" : "moderation-box blocked"}>
          <AlertTriangle size={18} />
          <div>
            <strong>{moderation.level}</strong>
            <span>{moderation.message}</span>
          </div>
        </div>

        <div className="escrow-ladder">
          <StepLine done={hasEnoughBalance} label={`Total a bloquear al crear: ${totalRequiredLabel} aUSDT`} action="Recibir aUSDT testnet" onAction={onAddFunds} />
          <StepLine done={!needsApproval} label="ChallengeFactory autorizado solo por recompensa + bond" action="Autorizar retos" onAction={onApprove} />
          <div className="step-line pending">
            <LockKeyhole size={17} />
            <span>Recompensa escrowed: {stakeLabel} aUSDT. Bond creador: {bondAmountLabel} aUSDT.</span>
          </div>
          <div className="step-line pending">
            <Eye size={17} />
            <span>El ejecutor acepta desde otra wallet, bloquea su bond y puede publicar live.</span>
          </div>
          <div className="step-line pending">
            <FileCheck size={17} />
            <span>La resolucion paga la recompensa menos fee variable de 4% a 10% o reembolsa si no se cumple.</span>
          </div>
        </div>

        <div className="tag-row">
          {bondReasons.map((reason) => (
            <span className="tag" key={reason}>{reason}</span>
          ))}
        </div>

        <button
          className="primary-action danger-action"
          onClick={onCreate}
          disabled={!moderation.allowed || !hasEnoughBalance || needsApproval}
        >
          Crear reto Underworld <ChevronRight size={16} />
        </button>

        <div className="challenge-actions">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Ejecutar o probar flujo</p>
              <h3>Acciones del reto</h3>
            </div>
          </div>
          <p className="help-text">Selecciona un ID de la lista. Si eres el creador, usa otra wallet para aceptar; el contrato lo bloquea por seguridad.</p>
          <div className="form-grid">
            <label>
              ID del reto
              <input value={actionId} onChange={(event) => onActionId(event.target.value)} />
            </label>
            <label>
              Evidencia final
              <input
                value={evidenceUrl}
                onChange={(event) => onEvidenceUrl(event.target.value)}
                placeholder="ipfs://... o https://..."
              />
            </label>
          </div>
          <div className="action-grid">
            <button onClick={onApproveExecutor} disabled={!actionId.trim()}>Autorizar bond ejecutor</button>
            <button onClick={onAccept} disabled={!actionId.trim()}>Aceptar reto</button>
            <button onClick={onUpdateLive} disabled={!actionId.trim() || !liveUrl.trim()}>Actualizar live</button>
            <button onClick={onSubmitEvidence} disabled={!actionId.trim() || !evidenceUrl.trim()}>Enviar evidencia</button>
          </div>
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Resolucion optimista</p>
              <h3>Acuerdo, disputa o arbitraje</h3>
            </div>
          </div>
          <p className="help-text">
            Una parte propone el resultado. La otra puede confirmarlo para cerrar antes, o abrir
            una disputa con bond reembolsable si el arbitro le da la razon.
          </p>
          <label>
            Motivo de disputa o arbitraje
            <input
              value={disputeReason}
              onChange={(event) => onDisputeReason(event.target.value)}
              placeholder="Describe el desacuerdo y referencia la evidencia"
            />
          </label>
          <div className="action-grid">
            <button onClick={() => onPropose(true)} disabled={!actionId.trim()}>Proponer: cumplido</button>
            <button onClick={() => onPropose(false)} disabled={!actionId.trim()}>Proponer: no cumplido</button>
            <button onClick={() => onConfirm(true)} disabled={!actionId.trim()}>Confirmar: cumplido</button>
            <button onClick={() => onConfirm(false)} disabled={!actionId.trim()}>Confirmar: no cumplido</button>
            <button onClick={onApproveDispute} disabled={!actionId.trim()}>Autorizar bond de disputa</button>
            <button onClick={onDispute} disabled={!actionId.trim() || !disputeReason.trim()}>Abrir disputa</button>
            <button onClick={onFinalize} disabled={!actionId.trim()}>Finalizar sin disputa</button>
            <button onClick={() => onResolveDispute(true)} disabled={!actionId.trim() || !disputeReason.trim()}>
              Arbitro: cumplido
            </button>
            <button onClick={() => onResolveDispute(false)} disabled={!actionId.trim() || !disputeReason.trim()}>
              Arbitro: no cumplido
            </button>
          </div>
        </div>
        <TxState tx={tx} />
      </aside>
    </section>
  );
}

function CreateView({
  question,
  category,
  closesInMinutes,
  resolvesInMinutes,
  bondAmountLabel,
  bondReasons,
  needsApproval,
  hasEnoughBalance,
  tx,
  onQuestion,
  onCategory,
  onCloses,
  onResolves,
  onAddFunds,
  onApprove,
  onCreate,
}: {
  question: string;
  category: string;
  closesInMinutes: number;
  resolvesInMinutes: number;
  bondAmountLabel: string;
  bondReasons: readonly string[];
  needsApproval: boolean;
  hasEnoughBalance: boolean;
  tx: { status: string; label: string; hash?: string; error?: string };
  onQuestion: (value: string) => void;
  onCategory: (value: string) => void;
  onCloses: (value: number) => void;
  onResolves: (value: number) => void;
  onAddFunds: () => void;
  onApprove: () => void;
  onCreate: () => void;
}) {
  return (
    <section className="create-layout">
      <div className="wizard">
        <p className="eyebrow">Crear mercado</p>
        <h2>Haz una pregunta clara. Alterford se encarga del escrow.</h2>
        <label>
          Pregunta
          <textarea value={question} onChange={(event) => onQuestion(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Categoria
            <select value={category} onChange={(event) => onCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Cierra en minutos
            <input
              type="number"
              min={5}
              value={closesInMinutes}
              onChange={(event) => onCloses(Number(event.target.value))}
            />
          </label>
          <label>
            Se resuelve en minutos
            <input
              type="number"
              min={10}
              value={resolvesInMinutes}
              onChange={(event) => onResolves(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
      <aside className="review-panel">
        <p className="eyebrow">Revision antes de pagar</p>
        <h2>{bondAmountLabel} aUSDT</h2>
        <p>Este bond se bloquea al crear el mercado. Se devuelve si el creador cumple las reglas; se puede slashear por fraude o abuso.</p>
        <div className="tag-row">
          {bondReasons.map((reason) => (
            <span className="tag" key={reason}>{reason}</span>
          ))}
        </div>
        <StepLine done={hasEnoughBalance} label="Tienes aUSDT testnet suficiente" action="Recibir aUSDT testnet" onAction={onAddFunds} />
        <StepLine done={!needsApproval} label="Alterford esta autorizado a usar solo el monto mostrado" action="Autorizar aUSDT" onAction={onApprove} />
        <button className="primary-action" onClick={onCreate} disabled={!hasEnoughBalance || needsApproval}>
          Crear mercado
        </button>
        <TxState tx={tx} />
      </aside>
    </section>
  );
}

function PortfolioView({
  accountLabel,
  depositAddress,
  desiredChainId,
  settlementToken,
  balanceLabel,
  allowanceLabel,
  marketId,
  tx,
  onMarketId,
  onAddFunds,
  onApprove,
  onClaim,
  onRefund,
}: {
  accountLabel: string;
  depositAddress?: string;
  desiredChainId: number;
  settlementToken?: string;
  balanceLabel: string;
  allowanceLabel: string;
  marketId: string;
  tx: { status: string; label: string; hash?: string; error?: string };
  onMarketId: (value: string) => void;
  onAddFunds: () => void;
  onApprove: () => void;
  onClaim: () => void;
  onRefund: () => void;
}) {
  return (
    <section className="portfolio-grid">
      <InfoCard title="Tu cuenta" icon={<UserRound size={18} />}>
        <p>{accountLabel}</p>
        <strong>{balanceLabel}</strong>
        <span>aUSDT es un token mock en Base Sepolia para probar Alterford. No es USDT real.</span>
      </InfoCard>
      <DepositCard depositAddress={depositAddress} desiredChainId={desiredChainId} settlementToken={settlementToken} />
      <InfoCard title="Autorizacion" icon={<ShieldCheck size={18} />}>
        <strong>{allowanceLabel}</strong>
        <span>Autorizar no cobra fondos. Es permiso previo; el cobro ocurre solo al crear, aceptar reto o apostar.</span>
        <button onClick={onApprove}>Autorizar aUSDT testnet</button>
      </InfoCard>
      <InfoCard title="aUSDT testnet" icon={<Zap size={18} />}>
        <span>Recibe 100 aUSDT mock para pruebas. Solo pagas gas de Base Sepolia.</span>
        <button onClick={onAddFunds}>Recibir 100 aUSDT testnet</button>
      </InfoCard>
      <InfoCard title="Cobros" icon={<Trophy size={18} />}>
        <label>
          Market ID
          <input value={marketId} onChange={(event) => onMarketId(event.target.value)} />
        </label>
        <button onClick={onClaim}>Cobrar ganancia</button>
        <button onClick={onRefund}>Recibir reembolso</button>
        <TxState tx={tx} />
      </InfoCard>
    </section>
  );
}

function DepositCard({
  depositAddress,
  desiredChainId,
  settlementToken,
}: {
  depositAddress?: string;
  desiredChainId: number;
  settlementToken?: string;
}) {
  const [manualAddress, setManualAddress] = useState("");
  const address = (depositAddress || manualAddress).trim();
  const validAddress = isAddress(address);
  const qrValue = validAddress ? `ethereum:${address}@${desiredChainId}` : "alterford://deposit";

  async function copyAddress() {
    if (!validAddress) return;
    await navigator.clipboard?.writeText(address);
  }

  return (
    <InfoCard title="Depositar cripto" icon={<QrIcon />}>
      <span>Recibir fondos no firma transacciones ni cobra gas.</span>
      <label>
        Direccion de cuenta Alterford
        <input
          value={address}
          onChange={(event) => setManualAddress(event.target.value)}
          placeholder="0x..."
          readOnly={Boolean(depositAddress)}
        />
      </label>
      <div className="deposit-qr" aria-label="QR de deposito cripto">
        <QRCodeSVG value={qrValue} size={148} marginSize={2} />
      </div>
      <span>Red requerida: Base Sepolia. En mainnet debe usarse Base Mainnet; BTC/XMR/QR fiat necesitan pasarela externa antes de acreditar saldo.</span>
      <small>Token de prueba: {settlementToken || "no configurado"}</small>
      <button onClick={copyAddress} disabled={!validAddress}>Copiar direccion</button>
      {!validAddress && <small>Conecta una wallet o pega una direccion 0x valida para generar el QR.</small>}
    </InfoCard>
  );
}

function QrIcon() {
  return (
    <span className="qr-icon" aria-hidden="true">
      QR
    </span>
  );
}

function CreatorView({
  isUnderworldMode,
  bondAmountLabel,
  bondReasons,
  indexerStatus,
  marketCount,
  tx,
  onToggleMode,
  onResolve,
}: {
  isUnderworldMode: boolean;
  bondAmountLabel: string;
  bondReasons: readonly string[];
  indexerStatus: string;
  marketCount: number;
  tx: { status: string; label: string; hash?: string; error?: string };
  onToggleMode: () => void;
  onResolve: () => void;
}) {
  return (
    <section className="portfolio-grid">
      <InfoCard title="Modo del creador" icon={<Flame size={18} />}>
        <strong>{isUnderworldMode ? "Underworld" : "Vanilla"}</strong>
        <span>Underworld exige mas garantia porque el riesgo de abuso es mayor.</span>
        <button onClick={onToggleMode}>Cambiar modo</button>
      </InfoCard>
      <InfoCard title="Bond estimado" icon={<Gauge size={18} />}>
        <strong>{bondAmountLabel} aUSDT</strong>
        <div className="tag-row">
          {bondReasons.map((reason) => (
            <span className="tag" key={reason}>{reason}</span>
          ))}
        </div>
      </InfoCard>
      <InfoCard title="Indexer" icon={<History size={18} />}>
        <strong>{indexerStatus}</strong>
        <span>{marketCount} mercados indexados</span>
      </InfoCard>
      <InfoCard title="Operador" icon={<BadgeCheck size={18} />}>
        <span>Resolver solo debe usarse cuando el resultado real ya es claro.</span>
        <button onClick={onResolve}>Resolver mercado seleccionado</button>
        <TxState tx={tx} />
      </InfoCard>
    </section>
  );
}

function StatusItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="status-item">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StepLine({ done, label, action, onAction }: { done: boolean; label: string; action: string; onAction: () => void }) {
  return (
    <div className={done ? "step-line done" : "step-line"}>
      <CheckCircle2 size={17} />
      <span>{label}</span>
      {!done && <button onClick={onAction}>{action}</button>}
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <article className="info-card">
      <div className="section-title compact">
        <h2>{title}</h2>
        {icon}
      </div>
      {children}
    </article>
  );
}

function TxState({ tx }: { tx: { status: string; label: string; hash?: string; error?: string } }) {
  const helper =
    tx.status === "pending" && !tx.hash
      ? "Abre tu wallet y confirma o rechaza la solicitud. Alterford no puede firmar por ti."
      : tx.status === "pending" && tx.hash
        ? "Transaccion enviada. Esperando confirmacion en Base Sepolia."
        : tx.status === "confirmed"
          ? "Confirmado on-chain. Los saldos se actualizaran automaticamente."
          : tx.status === "failed"
            ? "No se movieron fondos si la wallet rechazo o la transaccion fallo antes de enviarse."
            : "Listo para la siguiente accion.";
  return (
    <div className={`tx-state ${tx.status}`}>
      <strong>{tx.label}</strong>
      <span>{tx.status}</span>
      <small>{helper}</small>
      {tx.hash && <small>{tx.hash}</small>}
      {tx.error && <small>{tx.error}</small>}
    </div>
  );
}

function mergeMarkets(indexed: MarketDTO[], fallback: MarketDTO[]): MarketDTO[] {
  const normalized = indexed.map((market) => ({
    ...market,
    id: market.id ?? String((market as { marketId?: string }).marketId ?? "0"),
    description: market.description || "Mercado creado por usuarios en Base Sepolia.",
    category: market.category || "UserMarkets",
    state: market.state || "Open",
  }));
  return normalized.length > 0 ? normalized : fallback;
}

function toMarketViewModel(market: MarketDTO): MarketViewModel {
  return {
    id: market.id,
    title: market.title,
    description: market.description || market.metadataURI || "Mercado creado por usuarios en Base Sepolia.",
    category: market.category || "UserMarkets",
    state: market.state || "Open",
    yesOdds: market.impliedOddsByOutcome?.[0] ?? 50,
    noOdds: market.impliedOddsByOutcome?.[1] ?? 50,
    poolByOutcome: toPoolArray(market.poolByOutcome),
  };
}

function calculateSelectedMarketQuote(
  poolByOutcome: readonly bigint[] | undefined,
  selectedOutcome: 0 | 1,
  userStake: bigint,
): MarketQuoteView {
  const currentPool = poolByOutcome?.length ? poolByOutcome : [0n, 0n];
  const sameSidePoolBefore = currentPool[selectedOutcome] ?? 0n;
  const counterPoolBefore = currentPool[selectedOutcome === 0 ? 1 : 0] ?? 0n;
  const stakesByOutcome = [
    (currentPool[0] ?? 0n) + (selectedOutcome === 0 ? userStake : 0n),
    (currentPool[1] ?? 0n) + (selectedOutcome === 1 ? userStake : 0n),
  ];

  const settlement = calculateMarketSettlement({
    stakesByOutcome,
    winningOutcome: selectedOutcome,
    userWinningStake: userStake,
    noWinnersPolicy: "RefundAll",
    economics: DEFAULT_ECONOMICS,
  });
  return {
    ...settlement,
    sameSidePoolBefore,
    counterPoolBefore,
    totalPoolAfter: stakesByOutcome[0] + stakesByOutcome[1],
    netProfit: settlement.userPayout > userStake ? settlement.userPayout - userStake : 0n,
    loss: userStake,
  };
}

function formatPayoutMultiple(payout: bigint, stake: bigint): string {
  if (stake <= 0n) return "0.00x";
  const hundredths = (payout * 100n) / stake;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}x`;
}

function toPoolArray(poolByOutcome: unknown): readonly bigint[] {
  if (!poolByOutcome) return [0n, 0n];
  const values = Array.isArray(poolByOutcome)
    ? poolByOutcome
    : Object.values(poolByOutcome as Record<string, unknown>);
  return [toBigIntAmount(values[0]), toBigIntAmount(values[1])];
}

function toBigIntAmount(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function parseUsdtInput(value: string): bigint {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole = "0", fraction = ""] = normalized.split(".");
  const wholeUnits = BigInt(whole || "0") * 1_000_000n;
  const fractionUnits = BigInt((fraction.padEnd(6, "0").slice(0, 6) || "0"));
  return wholeUnits + fractionUnits;
}

function isUnsafeChallenge(title: string, evidence: string): boolean {
  const text = `${title} ${evidence}`.toLowerCase();
  return [
    "sangre",
    "menor",
    "menores",
    "arma",
    "armas",
    "veneno",
    "mata",
    "matar",
    "muerte",
    "asesin",
    "homicid",
    "suic",
    "mutil",
    "oblig",
    "coaccion",
    "coercion",
    "secuestro",
    "violacion",
    "tortura",
  ].some((keyword) => text.includes(keyword));
}

function getChallengeModeration(title: string, evidence: string) {
  if (isUnsafeChallenge(title, evidence)) {
    return {
      allowed: false,
      level: "Reto bloqueado",
      message: "Riesgo de muerte, dano grave, coercion, menores o violencia real. No se puede crear en Alterford.",
    };
  }
  if (title.trim().length < 16 || evidence.trim().length < 20) {
    return {
      allowed: false,
      level: "Faltan reglas",
      message: "Describe el reto y la evidencia con suficiente claridad antes de bloquear fondos.",
    };
  }
  return {
    allowed: true,
    level: "Reto revisable",
    message: "Puede crearse con bond on-chain, evidencia obligatoria y arbitraje si hay disputa.",
  };
}
