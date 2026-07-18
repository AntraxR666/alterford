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
  Mail,
  PlusCircle,
  ShieldCheck,
  Siren,
  Sparkles,
  Trophy,
  UserRound,
  WalletCards,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { isAddress, type Address, type Hex } from "viem";
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
  type XmrConversionAuthorization,
} from "@alterford/sdk";
import { sampleMarkets } from "./features/markets/sampleMarkets";
import { challengeAvailability, marketAvailability, partitionChallenges } from "./features/lifecycle";
import { XmrConversionCard } from "./features/xmr/XmrConversionCard";
import { useIndexerFeed } from "./hooks/useIndexerFeed";
import { useWeb3Flow } from "./hooks/useWeb3Flow";
import { useAppStore } from "./stores/appStore";
import { AlterfordGatewayClient } from "./web3/gatewayClient";

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
  lockTime: string;
  resolutionTime: string;
  lifecycleLabel: string;
  canResolve: boolean;
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
  "Las partes acuerdan; el arbitro decide solo si hay disputa.",
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
  const [challengeActionId, setChallengeActionId] = useState("");
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
  const fallbackBondEstimate = calculateCreationBond({
    entityType: "Market",
    mode: isUnderworldMode ? "Underworld" : "Vanilla",
    creatorTier: "Basic",
    categoryRisk: isUnderworldMode
      ? "Medium"
      : /deport|sport|clima|weather/i.test(createCategory) ? "Low" : "Medium",
    reputation: "New",
    expectedVolumeUsdt: 0n,
    disputeCount: 0,
    fraudCount: 0,
    policy: DEFAULT_BOND_POLICY,
  });
  const challengeStakeAmount = parseUsdtInput(challengeStake);
  const challengeRiskLevel = isUnsafeChallenge(challengeTitle, challengeEvidence) ? "Critical" : "Medium";
  const fallbackChallengeBondEstimate = calculateCreationBond({
    entityType: "Challenge",
    mode: "Underworld",
    creatorTier: "Basic",
    categoryRisk: "High",
    reputation: "New",
    expectedVolumeUsdt: challengeStakeAmount,
    disputeCount: 0,
    fraudCount: 0,
    policy: DEFAULT_BOND_POLICY,
  });
  const web3 = useWeb3Flow(
    fallbackBondEstimate,
    quickBetAmount,
    isUnderworldMode,
    createCategory,
    fallbackChallengeBondEstimate,
    challengeStakeAmount,
  );
  const bondEstimate = web3.bondEstimate;
  const challengeBondEstimate = web3.challengeBondEstimate;
  const markets = useMemo(
    () => import.meta.env.DEV ? mergeMarkets(indexer.markets, sampleMarkets) : indexer.markets,
    [indexer.markets],
  );
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const marketViews = useMemo(
    () => markets.map((market) => toMarketViewModel(market, nowSeconds)),
    [markets, nowSeconds],
  );
  const openMarketViews = marketViews.filter((market) => market.lifecycleLabel === "Abierto");
  const resolutionMarketViews = marketViews.filter((market) =>
    market.state === "Open" && market.lifecycleLabel !== "Abierto" || market.state === "Locked" || market.state === "Disputed",
  );
  const historyMarketViews = marketViews.filter((market) =>
    !openMarketViews.includes(market) && !resolutionMarketViews.includes(market),
  );
  const selectedMarketView = openMarketViews.find((market) => market.id === selectedMarketId) ?? openMarketViews[0];
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
            <>
              {web3.hasSocialLogin && (
                <button className="wallet-button" onClick={web3.connectSocialWallet} disabled={web3.isConnecting}>
                  <Mail size={16} /> Entrar con email
                </button>
              )}
              <button className="wallet-button primary" onClick={web3.connectWallet} disabled={web3.isConnecting}>
                <WalletCards size={16} />
                {web3.isConnecting ? "Conectando" : `Conectar ${preferredConnectorName}`}
              </button>
            </>
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
          markets={openMarketViews}
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
          accountAddress={web3.account.address}
          isArbiter={web3.isChallengeArbiter}
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
          gaslessAvailable={web3.gaslessChallengesAvailable}
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
          onCancel={() => web3.cancelChallenge({ challengeId: challengeActionId, reason: challengeDisputeReason })}
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
          gasBalanceLabel={web3.gasBalanceLabel}
          allowanceLabel={web3.allowanceLabel}
          marketId={web3.marketId}
          tx={web3.tx}
          onMarketId={web3.setMarketId}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveSettlement}
          onClaim={web3.claimReward}
          onRefund={web3.claimRefund}
          onSignXmr={web3.signXmrConversionAuthorization}
        />
      )}

      {activeTab === "creator" && (
        <CreatorView
          isUnderworldMode={isUnderworldMode}
          bondAmountLabel={bondAmountLabel}
          bondReasons={bondEstimate.reasons}
          indexerStatus={indexer.status}
          marketCount={indexer.marketCount}
          resolutionMarkets={resolutionMarketViews}
          historyMarkets={historyMarketViews}
          isResolver={web3.isMarketResolver}
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
        {markets.length === 0 && (
          <div className="empty-state">
            <strong>Aun no hay mercados abiertos</strong>
            <span>Abre la seccion Crear para publicar el primer mercado verificable de la beta.</span>
          </div>
        )}
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
        {!selectedMarket ? (
          <p className="help-text">El ticket se habilitara cuando exista un mercado abierto y selecciones una opcion.</p>
        ) : <>
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
        </>}
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
  accountAddress,
  isArbiter,
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
  gaslessAvailable,
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
  onCancel,
}: {
  title: string;
  indexedChallenges: ChallengeDTO[];
  accountAddress?: string;
  isArbiter: boolean;
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
  gaslessAvailable: boolean;
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
  onCancel: () => void;
}) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const partitions = partitionChallenges(indexedChallenges, nowSeconds);
  const selectedChallenge = indexedChallenges.find((challenge) => challenge.id === actionId);
  const selectedLifecycle = selectedChallenge
    ? challengeAvailability(selectedChallenge, nowSeconds)
    : undefined;
  const normalizedAccount = accountAddress?.toLowerCase();
  const isCreator = Boolean(
    selectedChallenge && normalizedAccount && selectedChallenge.creator.toLowerCase() === normalizedAccount,
  );
  const isExecutor = Boolean(
    selectedChallenge?.executor && normalizedAccount && selectedChallenge.executor.toLowerCase() === normalizedAccount,
  );
  const isParticipant = isCreator || isExecutor;
  const canAccept = Boolean(
    selectedChallenge && selectedChallenge.state === "Open" && selectedLifecycle?.group === "active" && !isCreator,
  );
  const canUpdateLive = Boolean(
    selectedChallenge && isParticipant && ["Accepted", "EvidenceSubmitted"].includes(selectedChallenge.state),
  );
  const canSubmitEvidence = Boolean(selectedChallenge && isExecutor && selectedChallenge.state === "Accepted");
  const canPropose = Boolean(
    selectedChallenge && isParticipant && selectedChallenge.state === "EvidenceSubmitted",
  );
  const canReview = Boolean(selectedChallenge && isParticipant && selectedChallenge.state === "Review");
  const canFinalize = Boolean(selectedChallenge && selectedChallenge.state === "Review");
  const canArbitrate = Boolean(selectedChallenge && isArbiter && selectedChallenge.state === "Disputed");
  const canCancelExpired = Boolean(
    selectedChallenge && isArbiter && selectedChallenge.state === "Open" && selectedLifecycle?.group === "history",
  );

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
        <ChallengeSection
          title="Retos activos"
          empty="No hay retos disponibles para aceptar."
          challenges={partitions.active}
          selectedId={actionId}
          nowSeconds={nowSeconds}
          onSelect={onActionId}
        />
        <ChallengeSection
          title="En resolucion"
          empty="No hay retos esperando evidencia, acuerdo o arbitraje."
          challenges={partitions.resolution}
          selectedId={actionId}
          nowSeconds={nowSeconds}
          onSelect={onActionId}
        />
        <details className="history-panel">
          <summary>Historial ({partitions.history.length})</summary>
          <ChallengeSection
            title="Finalizados o vencidos"
            empty="Todavia no hay historial."
            challenges={partitions.history}
            selectedId={actionId}
            nowSeconds={nowSeconds}
            onSelect={onActionId}
          />
        </details>
        <div className="section-title compact template-heading">
          <div>
            <p className="eyebrow">Inspiracion</p>
            <h3>Ejemplos, no retos activos</h3>
          </div>
        </div>
        <div className="challenge-cards template-cards">
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
        {gaslessAvailable && (
          <div className="step-line done">
            <Zap size={17} />
            <span>Gas patrocinado: las acciones core del reto requieren firma, pero Alterford paga el gas.</span>
          </div>
        )}
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
              <p className="eyebrow">Reto seleccionado</p>
              <h3>{selectedChallenge ? `#${selectedChallenge.id} · ${selectedLifecycle?.label}` : "Selecciona un reto"}</h3>
            </div>
          </div>
          <p className="help-text">
            {selectedChallenge
              ? challengeActionGuidance(selectedChallenge, { isCreator, isExecutor, isArbiter }, nowSeconds)
              : "Elige una tarjeta de Activos, En resolucion o Historial. Solo apareceran las acciones validas para tu cuenta."}
          </p>
          {selectedChallenge && <div className="selected-entity-summary">
            <strong>{selectedChallenge.title || `Reto #${selectedChallenge.id}`}</strong>
            <span>Estado on-chain: {selectedChallenge.state}. Tu rol: {isArbiter ? "arbitro" : isCreator ? "creador" : isExecutor ? "ejecutor" : "observador"}.</span>
          </div>}
          {selectedChallenge && (canSubmitEvidence || canPropose || canReview || canArbitrate) && <div className="form-grid">
            <label>
              Evidencia final
              <input
                value={evidenceUrl}
                onChange={(event) => onEvidenceUrl(event.target.value)}
                placeholder="ipfs://... o https://..."
              />
            </label>
          </div>}
          {canAccept && <div className="action-grid guided-actions">
            <button onClick={onApproveExecutor}>1. Autorizar bond ejecutor</button>
            <button onClick={onAccept}>2. Aceptar reto</button>
          </div>}
          {canUpdateLive && <div className="action-grid guided-actions">
            <button onClick={onUpdateLive} disabled={!liveUrl.trim()}>Publicar o actualizar live</button>
            {canSubmitEvidence && <button onClick={onSubmitEvidence} disabled={!evidenceUrl.trim()}>Enviar evidencia final</button>}
          </div>}
          {(canPropose || canReview || canArbitrate) && <>
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
          {(canReview || canArbitrate) && <label>
            Motivo de disputa o arbitraje
            <input
              value={disputeReason}
              onChange={(event) => onDisputeReason(event.target.value)}
              placeholder="Describe el desacuerdo y referencia la evidencia"
            />
          </label>}
          <div className="action-grid">
            {canPropose && <button onClick={() => onPropose(true)}>Proponer: cumplido</button>}
            {canPropose && <button onClick={() => onPropose(false)}>Proponer: no cumplido</button>}
            {canReview && <button onClick={() => onConfirm(true)}>Confirmar: cumplido</button>}
            {canReview && <button onClick={() => onConfirm(false)}>Confirmar: no cumplido</button>}
            {canReview && <button onClick={onApproveDispute}>Autorizar bond de disputa</button>}
            {canReview && <button onClick={onDispute} disabled={!disputeReason.trim()}>Abrir disputa</button>}
            {canFinalize && <button onClick={onFinalize}>Finalizar al vencer ventana</button>}
            {canArbitrate && <button onClick={() => onResolveDispute(true)} disabled={!disputeReason.trim()}>
              Arbitro: cumplido
            </button>}
            {canArbitrate && <button onClick={() => onResolveDispute(false)} disabled={!disputeReason.trim()}>
              Arbitro: no cumplido
            </button>}
          </div>
          </>}
          {canCancelExpired && <div className="operator-warning">
            <strong>Reto vencido sin ejecutor</strong>
            <span>Como arbitro puedes cancelarlo para devolver los fondos escrowed al creador.</span>
            <button onClick={onCancel}>Cancelar y habilitar reembolso</button>
          </div>}
        </div>
        <TxState tx={tx} />
      </aside>
    </section>
  );
}

function ChallengeSection({
  title,
  empty,
  challenges,
  selectedId,
  nowSeconds,
  onSelect,
}: {
  title: string;
  empty: string;
  challenges: ChallengeDTO[];
  selectedId: string;
  nowSeconds: number;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="lifecycle-section">
      <div className="section-title compact">
        <h3>{title}</h3>
        <span>{challenges.length}</span>
      </div>
      {challenges.length === 0 ? <p className="empty-inline">{empty}</p> : <div className="challenge-cards">
        {challenges.map((challenge) => {
          const availability = challengeAvailability(challenge, nowSeconds);
          return (
            <article className={selectedId === challenge.id ? "challenge-card live-card selected" : "challenge-card live-card"} key={challenge.id}>
              <div className="challenge-card-top">
                <Flame size={18} />
                <strong className={`lifecycle-badge ${availability.group}`}>{availability.label}</strong>
              </div>
              <h3>{challenge.title || `Reto #${challenge.id}`}</h3>
              <p>{challenge.description || challenge.metadataURI || "Reto creado por usuario con escrow on-chain."}</p>
              <div className="challenge-meta">
                <span>{formatUsdt(toBigIntAmount(challenge.rewardPool))} aUSDT</span>
                <span>ID #{challenge.id}</span>
              </div>
              {challenge.liveStreamURI ? (
                <a className="live-link" href={challenge.liveStreamURI} target="_blank" rel="noreferrer">Ver live proof</a>
              ) : (
                <small>{availability.group === "active" ? "Live pendiente. El ejecutor puede publicarlo al aceptar." : "Sin live publicado."}</small>
              )}
              <button className="entity-select" onClick={() => onSelect(challenge.id)}>
                {selectedId === challenge.id ? "Seleccionado" : availability.group === "history" ? "Ver detalle" : "Gestionar reto"}
              </button>
            </article>
          );
        })}
      </div>}
    </section>
  );
}

function challengeActionGuidance(
  challenge: ChallengeDTO,
  roles: { isCreator: boolean; isExecutor: boolean; isArbiter: boolean },
  nowSeconds: number,
): string {
  const availability = challengeAvailability(challenge, nowSeconds);
  if (availability.group === "history") {
    return challenge.state === "Open"
      ? "El plazo termino sin ejecutor. Ya no se puede aceptar; un arbitro debe cancelarlo para cerrar el escrow."
      : "Este reto termino y se conserva solo como historial verificable.";
  }
  if (challenge.state === "Open") {
    return roles.isCreator
      ? "Eres el creador. Otra wallet debe aceptar y bloquear el bond de ejecutor."
      : "Para participar: autoriza el bond y luego acepta el reto. Autorizar no mueve fondos; aceptar si los bloquea.";
  }
  if (challenge.state === "Accepted") {
    return roles.isExecutor
      ? "Publica el live si corresponde y envia la evidencia final al terminar."
      : "El ejecutor debe publicar la evidencia; puedes seguir el live mientras tanto.";
  }
  if (challenge.state === "EvidenceSubmitted") return "Creador o ejecutor puede proponer si el reto se cumplio.";
  if (challenge.state === "Review") return "La otra parte puede confirmar el mismo resultado, disputar o esperar el fin de la ventana.";
  if (challenge.state === "Disputed") {
    return roles.isArbiter
      ? "Revisa evidencia y motivo. Tu decision on-chain libera o devuelve el escrow y procesa los bonds."
      : "Existe una disputa. Solo el arbitro autorizado puede emitir la decision final on-chain.";
  }
  return "No hay acciones disponibles para esta cuenta en el estado actual.";
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
  gasBalanceLabel,
  allowanceLabel,
  marketId,
  tx,
  onMarketId,
  onAddFunds,
  onApprove,
  onClaim,
  onRefund,
  onSignXmr,
}: {
  accountLabel: string;
  depositAddress?: string;
  desiredChainId: number;
  settlementToken?: string;
  balanceLabel: string;
  gasBalanceLabel: string;
  allowanceLabel: string;
  marketId: string;
  tx: { status: string; label: string; hash?: string; error?: string };
  onMarketId: (value: string) => void;
  onAddFunds: () => void;
  onApprove: () => void;
  onClaim: () => void;
  onRefund: () => void;
  onSignXmr: (input: XmrConversionAuthorization) => Promise<Hex>;
}) {
  return (
    <section className="portfolio-grid">
      <InfoCard title="Tu cuenta" icon={<UserRound size={18} />}>
        <p>{accountLabel}</p>
        <strong>{balanceLabel}</strong>
        <span>aUSDT es un token mock en Base Sepolia para probar Alterford. No es USDT real.</span>
      </InfoCard>
      <DepositCard
        depositAddress={depositAddress}
        desiredChainId={desiredChainId}
        settlementToken={settlementToken}
        gasBalanceLabel={gasBalanceLabel}
      />
      <XmrConversionCard
        beneficiary={depositAddress as Address | undefined}
        chainId={desiredChainId}
        signAuthorization={onSignXmr}
      />
      <FiatOnRampCard walletAddress={depositAddress} />
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

function FiatOnRampCard({ walletAddress }: { walletAddress?: string }) {
  const gatewayUrl = import.meta.env.VITE_GATEWAY_URL;
  const [amount, setAmount] = useState("25");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<"idle" | "pending" | "ready" | "failed">("idle");
  const [widgetUrl, setWidgetUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gatewayUrl) return;
    let active = true;
    new AlterfordGatewayClient(gatewayUrl).config()
      .then((config) => {
        if (active) setEnabled(config.fiatEnabled);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [gatewayUrl]);

  if (!gatewayUrl || !enabled) return null;

  async function createSession() {
    if (!walletAddress || !isAddress(walletAddress)) {
      setStatus("failed");
      setError("Conecta una wallet para definir la direccion que recibira la compra.");
      return;
    }
    const fiatAmount = Number(amount);
    if (!Number.isFinite(fiatAmount) || fiatAmount < 10 || fiatAmount > 10_000) {
      setStatus("failed");
      setError("El monto debe estar entre 10 y 10.000 USD.");
      return;
    }
    try {
      setStatus("pending");
      setWidgetUrl("");
      setError("");
      const client = new AlterfordGatewayClient(gatewayUrl!);
      const config = await client.config();
      if (!config.fiatEnabled) throw new Error("El proveedor fiat aun no esta habilitado.");
      const orderId = `alterford-${crypto.randomUUID()}`;
      const session = await client.createFiatSession({
        walletAddress: walletAddress as Address,
        fiatAmount,
        fiatCurrency: "USD",
        cryptoCurrencyCode: "ETH",
        network: "base",
        partnerOrderId: orderId,
        idempotencyKey: orderId,
      });
      setWidgetUrl(session.widgetUrl);
      setStatus("ready");
    } catch (caught) {
      setStatus("failed");
      setError(caught instanceof Error ? caught.message : "No se pudo iniciar la compra.");
    }
  }

  return (
    <InfoCard title="Comprar cripto" icon={<WalletCards size={18} />}>
      <span>Compra ETH en Base mediante un proveedor externo. Alterford no custodia dinero fiat ni datos de pago.</span>
      <label>
        Monto en USD
        <input type="number" min={10} max={10_000} value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <button onClick={createSession} disabled={status === "pending" || !walletAddress}>
        {status === "pending" ? "Creando sesion segura" : "Ver metodos de pago"}
      </button>
      {status === "ready" && widgetUrl && (
        <a className="button-link" href={widgetUrl} target="_blank" rel="noopener">
          Continuar con el proveedor
        </a>
      )}
      {status === "failed" && <small className="error-text">{error}</small>}
      <small>En Base Sepolia se usa el faucet aUSDT. La compra fiat entrega un activo soportado por el proveedor en la red seleccionada.</small>
    </InfoCard>
  );
}

function DepositCard({
  depositAddress,
  desiredChainId,
  settlementToken,
  gasBalanceLabel,
}: {
  depositAddress?: string;
  desiredChainId: number;
  settlementToken?: string;
  gasBalanceLabel: string;
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
    <InfoCard title="Recibir fondos en Alterford" icon={<QrIcon />}>
      <span>Esta es la unica direccion receptora de esta cuenta.</span>
      <label>
        Direccion receptora de tu cuenta Alterford
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
      <span>Red requerida: Base Sepolia. Envia solo ETH de Base Sepolia para gas o aUSDT del contrato indicado abajo.</span>
      <strong>Saldo para gas: {gasBalanceLabel}</strong>
      <small>ETH de Base Sepolia es gas y no se suma al saldo aUSDT.</small>
      <small>Contrato aUSDT (dato tecnico, no enviar fondos aqui)</small>
      <code>{settlementToken || "no configurado"}</code>
      <button onClick={copyAddress} disabled={!validAddress}>Copiar direccion receptora</button>
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
  resolutionMarkets,
  historyMarkets,
  isResolver,
  tx,
  onToggleMode,
  onResolve,
}: {
  isUnderworldMode: boolean;
  bondAmountLabel: string;
  bondReasons: readonly string[];
  indexerStatus: string;
  marketCount: number;
  resolutionMarkets: MarketViewModel[];
  historyMarkets: MarketViewModel[];
  isResolver: boolean;
  tx: { status: string; label: string; hash?: string; error?: string };
  onToggleMode: () => void;
  onResolve: (input: { marketId: string; winningOutcome: 0 | 1 }) => void;
}) {
  const [outcomes, setOutcomes] = useState<Record<string, 0 | 1>>({});
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
        <strong>{isResolver ? "Rol RESOLVER activo" : "Modo lectura"}</strong>
        <span>
          {isResolver
            ? "Verifica la fuente externa y elige explicitamente el resultado de cada mercado. Resolver distribuye el pool; no se puede deshacer."
            : "La wallet conectada no tiene permiso para resolver. Conecta la wallet oficial del operador."}
        </span>
        <div className="operator-market-list">
          {resolutionMarkets.length === 0 && <small>No hay mercados pendientes de resolucion.</small>}
          {resolutionMarkets.map((market) => (
            <article className="operator-market" key={market.id}>
              <div>
                <strong>#{market.id} · {market.lifecycleLabel}</strong>
                <span>{market.title}</span>
                {market.resolutionTime && <small>Resolucion programada: {formatLifecycleTime(market.resolutionTime)}</small>}
              </div>
              <div className="operator-outcome" aria-label={`Resultado del mercado ${market.id}`}>
                <button
                  className={(outcomes[market.id] ?? 0) === 0 ? "selected yes" : "yes"}
                  onClick={() => setOutcomes((current) => ({ ...current, [market.id]: 0 }))}
                >SI</button>
                <button
                  className={outcomes[market.id] === 1 ? "selected no" : "no"}
                  onClick={() => setOutcomes((current) => ({ ...current, [market.id]: 1 }))}
                >NO</button>
                <button
                  className="resolve-button"
                  onClick={() => onResolve({ marketId: market.id, winningOutcome: outcomes[market.id] ?? 0 })}
                  disabled={!isResolver || !market.canResolve}
                >
                  {market.canResolve ? "Resolver ahora" : "Esperando hora de resolucion"}
                </button>
              </div>
            </article>
          ))}
        </div>
        <details className="history-panel compact-history">
          <summary>Mercados finalizados ({historyMarkets.length})</summary>
          {historyMarkets.map((market) => <small key={market.id}>#{market.id} · {market.state} · {market.title}</small>)}
        </details>
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

function toMarketViewModel(market: MarketDTO, nowSeconds: number): MarketViewModel {
  const lifecycle = marketAvailability(market, nowSeconds);
  return {
    id: market.id,
    title: market.title,
    description: market.description || market.metadataURI || "Mercado creado por usuarios en Base Sepolia.",
    category: market.category || "UserMarkets",
    state: market.state || "Open",
    yesOdds: market.impliedOddsByOutcome?.[0] ?? 50,
    noOdds: market.impliedOddsByOutcome?.[1] ?? 50,
    poolByOutcome: toPoolArray(market.poolByOutcome),
    lockTime: market.lockTime || "",
    resolutionTime: market.resolutionTime || "",
    lifecycleLabel: lifecycle.label,
    canResolve: lifecycle.group === "resolution" && lifecycle.actionable,
  };
}

function formatLifecycleTime(value: string): string {
  if (!value) return "No disponible";
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric * 1_000) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-BO");
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
