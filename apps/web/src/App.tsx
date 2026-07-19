import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Eye,
  FileCheck,
  Flame,
  Gauge,
  History,
  ImagePlus,
  LockKeyhole,
  Mail,
  PlusCircle,
  ShieldCheck,
  Siren,
  Sparkles,
  Trophy,
  UploadCloud,
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
  type BountyDTO,
  type ChallengeDTO,
  type MarketDTO,
  type XmrConversionAuthorization,
} from "@alterford/sdk";
import {
  challengeAvailability,
  challengeCountdown,
  bountyCountdown,
  marketAvailability,
  marketCountdown,
  partitionChallenges,
} from "./features/lifecycle";
import { XmrConversionCard } from "./features/xmr/XmrConversionCard";
import { challengeWorkflow, filterChallengesByMode } from "./features/challenges/challengeWorkflow";
import { bountyWorkflow, filterBountiesByMode } from "./features/bounties/bountyWorkflow";
import {
  DEFAULT_EVIDENCE_UPLOAD_POLICY,
  evidenceFileToBase64,
  validateEvidenceImage,
} from "./features/bounties/evidenceUpload";
import { useIndexerFeed } from "./hooks/useIndexerFeed";
import { useLiveNow } from "./hooks/useLiveNow";
import { useWeb3Flow, type ChallengeExecutionMode } from "./hooks/useWeb3Flow";
import { useAppStore, type ApprovalMode } from "./stores/appStore";
import { AlterfordGatewayClient } from "./web3/gatewayClient";

type TabId = "markets" | "challenges" | "bounties" | "create" | "portfolio" | "creator";
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
  countdownLabel?: string;
  countdownUrgency?: "none" | "normal" | "high";
  countdownTarget?: string;
  canResolve: boolean;
};

const ONBOARDING_STORAGE_KEY = "alterford:intro-dismissed:v1";

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
  { id: "bounties", label: "Bounties", icon: <Trophy size={16} /> },
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
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  });
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
  const [bountyTitle, setBountyTitle] = useState("Recompensa por la mejor evidencia verificable");
  const [bountyDescription, setBountyDescription] = useState("Publica una entrega verificable antes del cierre.");
  const [bountyReward, setBountyReward] = useState("50");
  const [bountyDeadline, setBountyDeadline] = useState(1_440);
  const [bountyActionId, setBountyActionId] = useState("");
  const [bountyEvidence, setBountyEvidence] = useState("");
  const [bountyWinner, setBountyWinner] = useState("");
  const [bountyReason, setBountyReason] = useState("");
  const {
    isUnderworldMode,
    quickBetAmount,
    highRollerMode,
    approvalMode,
    toggleUnderworldMode,
    setQuickBetAmount,
    setHighRollerMode,
    setApprovalMode,
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
    mode: isUnderworldMode ? "Underworld" : "Vanilla",
    creatorTier: "Basic",
    categoryRisk: isUnderworldMode ? "High" : "Medium",
    reputation: "New",
    expectedVolumeUsdt: challengeStakeAmount,
    disputeCount: 0,
    fraudCount: 0,
    policy: DEFAULT_BOND_POLICY,
  });
  const bountyRewardAmount = parseUsdtInput(bountyReward);
  const fallbackBountyBondEstimate = calculateCreationBond({
    entityType: "Bounty",
    mode: isUnderworldMode ? "Underworld" : "Vanilla",
    creatorTier: "Basic",
    categoryRisk: isUnderworldMode ? "High" : "Medium",
    reputation: "New",
    expectedVolumeUsdt: bountyRewardAmount,
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
    fallbackBountyBondEstimate,
    bountyRewardAmount,
    isUnderworldMode,
    approvalMode,
  );
  const bondEstimate = web3.bondEstimate;
  const challengeBondEstimate = web3.challengeBondEstimate;
  const bountyBondEstimate = web3.bountyBondEstimate;
  const markets = indexer.markets;
  const nowSeconds = useLiveNow();
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
  const visualUnderworldMode = isUnderworldMode;
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

  function dismissIntro() {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      // The guide still closes when storage is unavailable.
    }
    setShowIntro(false);
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
          <button className="icon-text-button" onClick={() => setShowIntro(true)}>
            <CircleHelp size={16} /> Guia rapida
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

      {showIntro && <FirstRunIntro onDismiss={dismissIntro} />}

      <section className="status-strip">
        <StatusItem icon={<CheckCircle2 size={17} />} label="Conectar wallet" value="Gratis" />
        <StatusItem icon={<WalletCards size={17} />} label="Saldo" value={web3.balanceLabel} />
        <StatusItem icon={<ShieldCheck size={17} />} label="Permiso mercados" value={web3.allowanceLabel} />
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
          nowSeconds={nowSeconds}
          onSelectMarket={chooseMarketById}
          onSelectOutcome={web3.setSelectedOutcome}
          onQuickAmount={setQuickBetAmount}
          onToggleHighRoller={() => setHighRollerMode(!highRollerMode)}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveBetSettlement}
          onBet={web3.placeBet}
        />
      )}

      {activeTab === "challenges" && (
        <ChallengesView
          title={challengeTitle}
          nowSeconds={nowSeconds}
          isUnderworldMode={isUnderworldMode}
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
          executionMode={web3.challengeExecutionMode}
          needsApproval={web3.needsChallengeApproval}
          hasEnoughBalance={web3.hasEnoughChallengeBalance}
          executorNeedsApproval={web3.needsChallengeExecutorApproval}
          executorHasEnoughBalance={web3.hasEnoughChallengeExecutorBalance}
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
          onExecutionMode={web3.selectChallengeExecutionMode}
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
          onResolve={(executorSucceeded) =>
            web3.resolveChallenge({
              challengeId: challengeActionId,
              executorSucceeded,
              reason: challengeDisputeReason,
            })
          }
          onCancel={() => web3.cancelChallenge({ challengeId: challengeActionId, reason: challengeDisputeReason })}
        />
      )}

      {activeTab === "bounties" && (
        <BountiesView
          bounties={indexer.bounties}
          isUnderworldMode={isUnderworldMode}
          nowSeconds={nowSeconds}
          accountAddress={web3.account.address}
          title={bountyTitle}
          description={bountyDescription}
          reward={bountyReward}
          rewardAmount={bountyRewardAmount}
          deadline={bountyDeadline}
          selectedId={bountyActionId}
          evidence={bountyEvidence}
          winner={bountyWinner}
          reason={bountyReason}
          bondAmountLabel={formatUsdt(bountyBondEstimate.amount)}
          totalCostLabel={web3.bountyTotalCostLabel}
          bondReasons={bountyBondEstimate.reasons}
          needsApproval={web3.needsBountyApproval}
          hasEnoughBalance={web3.hasEnoughBountyBalance}
          isResolver={web3.isBountyResolver}
          isArbiter={web3.isBountyArbiter}
          tx={web3.tx}
          onTitle={setBountyTitle}
          onDescription={setBountyDescription}
          onReward={setBountyReward}
          onDeadline={setBountyDeadline}
          onSelectedId={setBountyActionId}
          onEvidence={setBountyEvidence}
          onWinner={setBountyWinner}
          onReason={setBountyReason}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveBountySettlement}
          onCreate={() => web3.createBounty({
            title: bountyTitle,
            description: bountyDescription,
            rewardPool: bountyRewardAmount,
            deadlineMinutes: bountyDeadline,
          })}
          onSubmit={() => web3.submitBounty({ bountyId: bountyActionId, evidenceURI: bountyEvidence })}
          onResolve={() => web3.resolveBounty({
            bountyId: bountyActionId,
            winner: isAddress(bountyWinner) ? bountyWinner : undefined,
            rewardPool: indexer.bounties.find((item) => item.id === bountyActionId)?.rewardEscrow
              ?? indexer.bounties.find((item) => item.id === bountyActionId)?.rewardPool,
          })}
          onCancel={() => web3.cancelBounty({ bountyId: bountyActionId, reason: bountyReason })}
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
          onApprove={web3.approveMarketCreation}
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
          challengeAllowanceLabel={web3.challengeAllowanceLabel}
          bountyAllowanceLabel={web3.bountyAllowanceLabel}
          marketApprovalTargetLabel={web3.marketApprovalTargetLabel}
          challengeApprovalTargetLabel={web3.challengeApprovalTargetLabel}
          bountyApprovalTargetLabel={web3.bountyApprovalTargetLabel}
          approvalMode={approvalMode}
          marketAllowance={web3.allowance}
          challengeAllowance={web3.challengeAllowance}
          bountyAllowance={web3.bountyAllowance}
          marketPermissionReady={!web3.needsApproval}
          challengePermissionReady={!web3.needsChallengeApproval}
          bountyPermissionReady={!web3.needsBountyApproval}
          marketId={web3.marketId}
          tx={web3.tx}
          onMarketId={web3.setMarketId}
          onAddFunds={web3.mintTestTokens}
          onApprove={web3.approveSettlement}
          onApproveChallenge={web3.approveChallengeSettlement}
          onApproveBounty={web3.approveBountySettlement}
          onApprovalMode={setApprovalMode}
          onRevokeMarket={web3.revokeMarketApproval}
          onRevokeChallenge={web3.revokeChallengeApproval}
          onRevokeBounty={web3.revokeBountyApproval}
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
  nowSeconds,
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
  nowSeconds: number;
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
              {market.countdownLabel && (
                <time
                  className={`lifecycle-countdown ${market.countdownUrgency ?? "normal"}`}
                  dateTime={market.countdownTarget}
                >
                  {market.countdownLabel}
                </time>
              )}
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
          <StepLine done={!needsApproval} label="Permiso disponible para esta prediccion" action="Autorizar una vez" onAction={onApprove} />
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
  nowSeconds,
  isUnderworldMode,
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
  executionMode,
  needsApproval,
  hasEnoughBalance,
  executorNeedsApproval,
  executorHasEnoughBalance,
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
  onExecutionMode,
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
  onResolve,
  onCancel,
}: {
  title: string;
  nowSeconds: number;
  isUnderworldMode: boolean;
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
  executionMode: ChallengeExecutionMode;
  needsApproval: boolean;
  hasEnoughBalance: boolean;
  executorNeedsApproval: boolean;
  executorHasEnoughBalance: boolean;
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
  onExecutionMode: (mode: ChallengeExecutionMode) => void;
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
  onResolve: (executorSucceeded: boolean) => void;
  onCancel: () => void;
}) {
  const [workflowView, setWorkflowView] = useState<"explore" | "mine" | "create">("explore");
  const modeChallenges = filterChallengesByMode(indexedChallenges, isUnderworldMode);
  const normalizedViewer = accountAddress?.toLowerCase();
  const myChallenges = modeChallenges.filter((challenge) =>
    Boolean(
      normalizedViewer
        && (challenge.creator.toLowerCase() === normalizedViewer
          || challenge.executor?.toLowerCase() === normalizedViewer),
    ) || (isArbiter && challenge.state === "Disputed"),
  );
  const exploredChallenges = modeChallenges.filter(
    (challenge) => challenge.creator.toLowerCase() !== normalizedViewer,
  );
  const visibleChallenges = workflowView === "mine" ? myChallenges : exploredChallenges;
  const partitions = partitionChallenges(visibleChallenges, nowSeconds);
  const selectedChallenge = modeChallenges.find((challenge) => challenge.id === actionId);
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
  const rawDeadline = Number(selectedChallenge?.deadline);
  const beforeDeadline = !Number.isFinite(rawDeadline) || nowSeconds <= rawDeadline;
  const canAccept = Boolean(
    selectedChallenge && selectedChallenge.state === "Open" && selectedLifecycle?.group === "active" && !isCreator,
  );
  const canUpdateLive = Boolean(
    selectedChallenge && beforeDeadline && isParticipant && ["Accepted", "EvidenceSubmitted"].includes(selectedChallenge.state),
  );
  const canSubmitEvidence = Boolean(
    selectedChallenge && beforeDeadline && isExecutor && selectedChallenge.state === "Accepted",
  );
  const canPropose = Boolean(
    selectedChallenge && isParticipant && selectedChallenge.state === "EvidenceSubmitted",
  );
  const canReview = Boolean(
    selectedChallenge
      && isParticipant
      && selectedChallenge.state === "Review"
      && selectedChallenge.resolutionProposal?.proposer.toLowerCase() !== normalizedAccount,
  );
  const proposalDeadline = Number(selectedChallenge?.resolutionProposal?.disputeDeadline);
  const canFinalize = Boolean(
    selectedChallenge
      && selectedChallenge.state === "Review"
      && Number.isFinite(proposalDeadline)
      && nowSeconds > proposalDeadline,
  );
  const canArbitrate = Boolean(selectedChallenge && isArbiter && selectedChallenge.state === "Disputed");
  const canOperatorResolve = Boolean(
    selectedChallenge
      && isArbiter
      && ["Accepted", "EvidenceSubmitted", "Review"].includes(selectedChallenge.state),
  );
  const canCancelExpired = Boolean(
    selectedChallenge && isArbiter && selectedChallenge.state === "Open" && selectedLifecycle?.group === "history",
  );
  const maxDeadlineMinutes = Number(stake) >= 1000 ? 2_880 : 1_440;
  const challengeEndLabel = new Date((nowSeconds + deadline * 60) * 1_000).toLocaleString("es-BO");
  const workflow = selectedChallenge
    ? challengeWorkflow(selectedChallenge, accountAddress as Address | undefined, isArbiter, nowSeconds)
    : undefined;

  return (
    <section className="workflow-page">
      <WorkflowNavigation
        ariaLabel="Vistas de retos"
        value={workflowView}
        items={[
          { id: "explore", label: "Explorar retos", description: "Retos disponibles" },
          { id: "mine", label: "Mis retos", description: "Tu actividad" },
          { id: "create", label: "Crear reto", description: "Publicar recompensa" },
        ]}
        onChange={(value) => setWorkflowView(value as typeof workflowView)}
      />
      <section className="challenge-layout">
      <div className="challenge-feed" hidden={workflowView === "create"}>
        <div className="section-title">
          <div>
            <p className="eyebrow">{workflowView === "mine" ? "Tu actividad" : isUnderworldMode ? "Retos Underworld" : "Retos Vanilla"}</p>
            <h2>{workflowView === "mine" ? "Continua exactamente desde el paso pendiente." : "Elige un reto y revisa sus condiciones antes de participar."}</h2>
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
          title={workflowView === "mine" ? "Tus retos activos" : "Disponibles para aceptar"}
          empty={workflowView === "mine" ? "No tienes retos activos con esta cuenta." : "No hay retos disponibles para aceptar."}
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
      </div>

      <aside className="challenge-builder">
        {workflowView === "create" && <>
        <p className="eyebrow">Crear reto protegido</p>
        <h2>Define el reto antes de bloquear fondos.</h2>
        <div className="role-notice">
          <UserRound size={18} />
          <div>
            <strong>La wallet conectada sera el creador</strong>
            <span>Otra wallet debe aceptar el reto y bloquear exclusivamente su bond de ejecutor.</span>
          </div>
        </div>
        <div className="execution-mode" aria-label="Modo de envio del reto">
          <button
            className={executionMode === "wallet" ? "selected" : ""}
            aria-pressed={executionMode === "wallet"}
            onClick={() => onExecutionMode("wallet")}
          >
            <WalletCards size={16} /> Wallet
          </button>
          <button
            className={executionMode === "gasless" ? "selected" : ""}
            aria-pressed={executionMode === "gasless"}
            onClick={() => onExecutionMode("gasless")}
            disabled={!gaslessAvailable}
          >
            <Zap size={16} /> Sin gas
          </button>
        </div>
        <p className="help-text">
          {executionMode === "gasless"
            ? "Firmaras una autorizacion EIP-712. Si el relay falla, no se moveran fondos y Alterford ofrecera el siguiente intento con Wallet."
            : gaslessAvailable
              ? "Ruta Wallet lista. Es la opcion mas fiable; usa una pequena cantidad de ETH de Base Sepolia para gas. Sin gas queda disponible como alternativa."
              : "Ruta Wallet lista. Usa una pequena cantidad de ETH de Base Sepolia de prueba; el patrocinio no esta confirmado ahora."}
        </p>
        <div className="builder-stage"><strong>1. Define que debe ocurrir</strong><span>Escribe una regla concreta y una prueba que cualquier persona pueda revisar.</span></div>
        <label>
          Reto
          <textarea value={title} onChange={(event) => onTitle(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Recompensa del reto (aUSDT)
            <input value={stake} onChange={(event) => onStake(event.target.value)} />
          </label>
          <label>
            Tiempo disponible
            <select
              value={deadline}
              onChange={(event) => onDeadline(Number(event.target.value))}
            >
              <option value={720}>12 horas</option>
              <option value={1_080}>18 horas</option>
              <option value={1_440}>24 horas</option>
              {maxDeadlineMinutes === 2_880 && <option value={2_880}>48 horas (alto valor)</option>}
            </select>
            <small>Finaliza aproximadamente: {challengeEndLabel}</small>
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
          <div className="builder-stage"><strong>2. Revisa el dinero protegido</strong><span>Este es el importe exacto que se bloqueara en el contrato.</span></div>
          <StepLine done={hasEnoughBalance} label={`Total a bloquear al crear: ${totalRequiredLabel} aUSDT`} action="Recibir aUSDT testnet" onAction={onAddFunds} />
          <div className="builder-stage"><strong>3. Prepara el permiso</strong><span>Autorizar no mueve aUSDT. Con el modo recomendado, el permiso restante sirve para proximos retos.</span></div>
          <StepLine done={!needsApproval} label="Permiso disponible para recompensa + bond" action="Autorizar una vez" onAction={onApprove} />
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
          disabled={!moderation.allowed || !hasEnoughBalance || needsApproval || tx.status === "pending"}
        >
          4. Crear reto {executionMode === "gasless" ? "sin gas" : "con Wallet"} <ChevronRight size={16} />
        </button>
        <p className="help-text">Este ultimo paso si bloquea {totalRequiredLabel} aUSDT en escrow. No existe otro cobro oculto.</p>
        </>}

        {workflowView !== "create" && <div className="challenge-actions guided-detail">
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
          {workflow && <>
            <LifecycleProgress steps={workflow.steps} />
            <div className="next-action-callout">
              <span>Tu siguiente paso</span>
              <strong>{workflow.headline}</strong>
              <p>{workflow.instruction}</p>
            </div>
          </>}
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
          {canAccept && <div className="guided-transaction">
            <strong>Aceptar este reto</strong>
            <span>El ejecutor bloquea {bondAmountLabel} aUSDT como garantia; no paga la recompensa.</span>
            {!executorHasEnoughBalance && <button onClick={onAddFunds}>Recibir aUSDT testnet</button>}
            {executorNeedsApproval
              ? <button onClick={onApproveExecutor}>1. Autorizar una vez el bond de {bondAmountLabel} aUSDT</button>
              : <button className="primary-action" onClick={onAccept}>2. Aceptar y bloquear bond</button>}
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
          {canOperatorResolve && <div className="operator-warning">
            <strong>Resolucion anticipada del arbitro</strong>
            <span>Usa esta accion cuando la evidencia ya permite cerrar sin esperar mas. La decision distribuye o devuelve el escrow y no se puede deshacer.</span>
            <input
              value={disputeReason}
              onChange={(event) => onDisputeReason(event.target.value)}
              placeholder="Motivo y referencia de evidencia"
            />
            <div className="action-grid">
              <button onClick={() => onResolve(true)} disabled={!disputeReason.trim()}>Resolver: cumplido</button>
              <button onClick={() => onResolve(false)} disabled={!disputeReason.trim()}>Resolver: no cumplido</button>
            </div>
          </div>}
        </div>}
        <TxState tx={tx} />
      </aside>
      </section>
    </section>
  );
}

function WorkflowNavigation({
  ariaLabel,
  value,
  items,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  items: readonly { id: string; label: string; description: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <nav className="workflow-navigation" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          className={value === item.id ? "active" : ""}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          <strong>{item.label}</strong>
          <span>{item.description}</span>
        </button>
      ))}
    </nav>
  );
}

function LifecycleProgress({ steps }: { steps: readonly { label: string; state: string }[] }) {
  return (
    <ol className="workflow-progress" aria-label="Progreso del proceso">
      {steps.map((step, index) => (
        <li className={step.state} key={step.label} aria-current={step.state === "current" ? "step" : undefined}>
          <strong>{step.state === "complete" ? <CheckCircle2 size={16} /> : index + 1}</strong>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
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
          const countdown = challengeCountdown(challenge, nowSeconds);
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
              {countdown && (
                <time className={`lifecycle-countdown ${countdown.urgency}`} dateTime={countdown.target}>
                  {countdown.label}
                </time>
              )}
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
    const deadline = Number(challenge.deadline);
    if (Number.isFinite(deadline) && nowSeconds > deadline) {
      return roles.isArbiter
        ? "El plazo de evidencia termino. Revisa lo disponible y resuelve como arbitro."
        : "El plazo de evidencia termino. Espera la resolucion del arbitro; no necesitas enviar otra transaccion.";
    }
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

function BountiesView({
  bounties,
  isUnderworldMode,
  nowSeconds,
  accountAddress,
  title,
  description,
  reward,
  rewardAmount,
  deadline,
  selectedId,
  evidence,
  winner,
  reason,
  bondAmountLabel,
  totalCostLabel,
  bondReasons,
  needsApproval,
  hasEnoughBalance,
  isResolver,
  isArbiter,
  tx,
  onTitle,
  onDescription,
  onReward,
  onDeadline,
  onSelectedId,
  onEvidence,
  onWinner,
  onReason,
  onAddFunds,
  onApprove,
  onCreate,
  onSubmit,
  onResolve,
  onCancel,
}: {
  bounties: BountyDTO[];
  isUnderworldMode: boolean;
  nowSeconds: number;
  accountAddress?: string;
  title: string;
  description: string;
  reward: string;
  rewardAmount: bigint;
  deadline: number;
  selectedId: string;
  evidence: string;
  winner: string;
  reason: string;
  bondAmountLabel: string;
  totalCostLabel: string;
  bondReasons: readonly string[];
  needsApproval: boolean;
  hasEnoughBalance: boolean;
  isResolver: boolean;
  isArbiter: boolean;
  tx: { status: string; label: string; hash?: string; error?: string };
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  onReward: (value: string) => void;
  onDeadline: (value: number) => void;
  onSelectedId: (value: string) => void;
  onEvidence: (value: string) => void;
  onWinner: (value: string) => void;
  onReason: (value: string) => void;
  onAddFunds: () => void;
  onApprove: () => void;
  onCreate: () => void;
  onSubmit: () => void;
  onResolve: () => void;
  onCancel: () => void;
}) {
  const [workflowView, setWorkflowView] = useState<"explore" | "mine" | "create">("explore");
  const [evidenceFile, setEvidenceFile] = useState<File>();
  const [evidenceUploadState, setEvidenceUploadState] = useState<"idle" | "uploading" | "uploaded" | "failed">("idle");
  const [evidenceUploadError, setEvidenceUploadError] = useState("");
  const modeBounties = filterBountiesByMode(bounties, isUnderworldMode);
  const normalizedViewer = accountAddress?.toLowerCase();
  const myBounties = modeBounties.filter((bounty) =>
    bounty.creator.toLowerCase() === normalizedViewer
      || bounty.submissions?.some((submission) => submission.submitter.toLowerCase() === normalizedViewer),
  );
  const visibleBounties = workflowView === "mine" ? myBounties : modeBounties;
  const isOpen = (bounty: BountyDTO) => {
    const deadlineSeconds = Number(bounty.deadline);
    return bounty.state === "Open" && (!Number.isFinite(deadlineSeconds) || deadlineSeconds > nowSeconds);
  };
  const activeBounties = visibleBounties.filter(isOpen);
  const resolutionBounties = visibleBounties.filter((bounty) => bounty.state === "Open" && !isOpen(bounty));
  const historyBounties = visibleBounties.filter((bounty) => bounty.state !== "Open");
  const selected = modeBounties.find((bounty) => bounty.id === selectedId);
  const selectedOpen = Boolean(selected && isOpen(selected));
  const selectedAwaitingResolution = Boolean(
    selected && selected.state === "Open" && !isOpen(selected),
  );
  const isCreator = Boolean(
    selected && accountAddress && selected.creator.toLowerCase() === accountAddress.toLowerCase(),
  );
  const endLabel = new Date((nowSeconds + deadline * 60) * 1_000).toLocaleString("es-BO");
  const workflow = selected
    ? bountyWorkflow(selected, accountAddress as Address | undefined, isResolver, isArbiter, nowSeconds)
    : undefined;
  const canSubmitEvidence = Boolean(
    selectedOpen
      && !isCreator
      && (workflow?.primaryAction === "submit-evidence" || workflow?.primaryAction === "update-evidence"),
  );
  const selectBounty = (id: string) => {
    onSelectedId(id);
    onEvidence("");
    onWinner("");
    setEvidenceFile(undefined);
    setEvidenceUploadState("idle");
    setEvidenceUploadError("");
  };
  const chooseEvidenceFile = (file?: File) => {
    setEvidenceUploadError("");
    setEvidenceUploadState("idle");
    setEvidenceFile(undefined);
    if (!file) return;
    try {
      validateEvidenceImage(file);
      setEvidenceFile(file);
    } catch (error) {
      setEvidenceUploadState("failed");
      setEvidenceUploadError(error instanceof Error ? error.message : "La imagen no es valida.");
    }
  };
  const uploadEvidence = async () => {
    if (!evidenceFile) return;
    const gatewayUrl = import.meta.env.VITE_GATEWAY_URL;
    if (!gatewayUrl) {
      setEvidenceUploadState("failed");
      setEvidenceUploadError("La subida de fotos no esta configurada. Puedes pegar un enlace IPFS verificable.");
      return;
    }
    setEvidenceUploadState("uploading");
    setEvidenceUploadError("");
    try {
      const client = new AlterfordGatewayClient(gatewayUrl);
      const config = await client.config();
      if (!config.evidenceUploads?.enabled) throw new Error("La subida de fotos no esta disponible ahora.");
      validateEvidenceImage(evidenceFile, config.evidenceUploads);
      const result = await client.uploadEvidenceImage({
        fileName: evidenceFile.name,
        mimeType: evidenceFile.type,
        bytesBase64: await evidenceFileToBase64(evidenceFile),
      });
      onEvidence(result.uri);
      setEvidenceUploadState("uploaded");
    } catch (error) {
      setEvidenceUploadState("failed");
      setEvidenceUploadError(error instanceof Error ? error.message : "No se pudo subir la foto.");
    }
  };

  return (
    <section className="workflow-page">
      <WorkflowNavigation
        ariaLabel="Vistas de bounties"
        value={workflowView}
        items={[
          { id: "explore", label: "Explorar bounties", description: isUnderworldMode ? "Solo Underworld" : "Solo Vanilla" },
          { id: "mine", label: "Mis entregas", description: "Tus bounties y pruebas" },
          { id: "create", label: "Crear bounty", description: "Publicar recompensa" },
        ]}
        onChange={(value) => setWorkflowView(value as typeof workflowView)}
      />
      <section className="challenge-layout bounty-layout">
      <div className="challenge-feed" hidden={workflowView === "create"}>
        <div className="section-title">
          <div>
            <p className="eyebrow">{isUnderworldMode ? "Bounty World / Underworld" : "Bounties Vanilla"}</p>
            <h2>{workflowView === "mine" ? "Continua tus entregas y revisa resultados." : "Completa una tarea y compite por una recompensa protegida."}</h2>
          </div>
          <span>{activeBounties.length} activos</span>
        </div>
        {activeBounties.length === 0 && <p className="empty-inline">No hay bounties abiertos ahora.</p>}
        <div className="challenge-cards">
          {activeBounties.map((bounty) => <BountyCard
            key={bounty.id}
            bounty={bounty}
            nowSeconds={nowSeconds}
            selected={selectedId === bounty.id}
            onSelect={selectBounty}
          />)}
        </div>
        <div className="section-title compact template-heading">
          <div><p className="eyebrow">Cierre</p><h3>Esperando resolucion ({resolutionBounties.length})</h3></div>
        </div>
        {resolutionBounties.length === 0 && <p className="empty-inline">No hay bounties pendientes de resolución.</p>}
        <div className="challenge-cards">
          {resolutionBounties.map((bounty) => <BountyCard
            key={bounty.id}
            bounty={bounty}
            nowSeconds={nowSeconds}
            selected={selectedId === bounty.id}
            onSelect={selectBounty}
          />)}
        </div>
        <details className="history-panel">
          <summary>Historial ({historyBounties.length})</summary>
          <div className="challenge-cards">
            {historyBounties.map((bounty) => <BountyCard
              key={bounty.id}
              bounty={bounty}
              nowSeconds={nowSeconds}
              selected={selectedId === bounty.id}
              onSelect={selectBounty}
            />)}
          </div>
        </details>
      </div>

      <aside className="challenge-builder">
        {workflowView === "create" && <>
        <p className="eyebrow">Crear bounty protegido</p>
        <h2>La recompensa se paga solo desde el escrow depositado.</h2>
        <label>
          Titulo del bounty
          <input value={title} onChange={(event) => onTitle(event.target.value)} />
        </label>
        <label>
          Entrega requerida
          <textarea value={description} onChange={(event) => onDescription(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Recompensa (aUSDT)
            <input value={reward} onChange={(event) => onReward(event.target.value)} />
          </label>
          <label>
            Tiempo para entregar
            <select value={deadline} onChange={(event) => onDeadline(Number(event.target.value))}>
              <option value={720}>12 horas</option>
              <option value={1_440}>24 horas</option>
              <option value={2_880}>48 horas</option>
            </select>
            <small>Cierra aproximadamente: {endLabel}</small>
          </label>
        </div>
        <div className="escrow-ladder">
          <StepLine done={hasEnoughBalance} label={`Total a bloquear: ${totalCostLabel}`} action="Recibir aUSDT testnet" onAction={onAddFunds} />
          <StepLine done={!needsApproval} label="Permiso disponible para recompensa + bond" action="Autorizar una vez" onAction={onApprove} />
          <div className="step-line pending"><LockKeyhole size={17} /><span>Recompensa: {formatUsdt(rewardAmount)} aUSDT. Bond creador: {bondAmountLabel} aUSDT.</span></div>
        </div>
        <div className="tag-row">
          {bondReasons.map((item) => <span className="tag" key={item}>{item}</span>)}
        </div>
        <button
          className="primary-action"
          onClick={onCreate}
          disabled={!title.trim() || !description.trim() || rewardAmount <= 0n || needsApproval || !hasEnoughBalance || tx.status === "pending"}
        >
          Crear y bloquear recompensa <ChevronRight size={16} />
        </button>
        <p className="help-text">Este paso bloquea recompensa + bond. Los participantes no apuestan contra ti: compiten enviando una entrega.</p>
        </>}

        {workflowView !== "create" && <div className="challenge-actions guided-detail">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Bounty seleccionado</p>
              <h3>{selected ? `#${selected.id} · ${selected.state}` : "Selecciona un bounty"}</h3>
            </div>
          </div>
          {selected && <div className="selected-entity-summary">
            <strong>{selected.title}</strong>
            <span>{isCreator ? "Eres el creador." : "Puedes enviar una entrega verificable mientras siga abierto."}</span>
          </div>}
          {workflow && <>
            <LifecycleProgress steps={workflow.steps} />
            <div className="next-action-callout">
              <span>Tu siguiente paso</span>
              <strong>{workflow.headline}</strong>
              <p>{workflow.instruction}</p>
            </div>
          </>}
          {canSubmitEvidence && <div className="evidence-uploader">
            <div className="builder-stage">
              <strong>1. Añade una prueba</strong>
              <span>Sube una foto o usa un enlace verificable. Elegir el archivo todavia no envia una transaccion.</span>
            </div>
            <label className="evidence-file-field">
              <ImagePlus size={18} /> Foto de evidencia
              <input
                type="file"
                accept={DEFAULT_EVIDENCE_UPLOAD_POLICY.mimeTypes.join(",")}
                onChange={(event) => chooseEvidenceFile(event.target.files?.[0])}
              />
            </label>
            {evidenceFile && <div className="selected-file">
              <span>{evidenceFile.name} · {(evidenceFile.size / 1024 / 1024).toFixed(2)} MiB</span>
              <button onClick={uploadEvidence} disabled={evidenceUploadState === "uploading"}>
                <UploadCloud size={16} /> {evidenceUploadState === "uploading" ? "Subiendo..." : "Subir foto a IPFS"}
              </button>
            </div>}
            <label>
              O pega un enlace de evidencia
              <input
                value={evidence}
                onChange={(event) => {
                  onEvidence(event.target.value);
                  setEvidenceUploadState("idle");
                }}
                placeholder="ipfs://... o https://..."
              />
            </label>
            {evidenceUploadState === "uploaded" && <p className="upload-success">Foto publicada. Ahora registra la entrega on-chain.</p>}
            {evidenceUploadError && <p className="upload-error" role="alert">{evidenceUploadError}</p>}
            <div className="builder-stage">
              <strong>2. Registra tu entrega</strong>
              <span>Este paso abre la wallet y guarda el hash y la URI de la prueba en el contrato.</span>
            </div>
            <button className="primary-action" onClick={onSubmit} disabled={!evidence.trim() || tx.status === "pending" || evidenceUploadState === "uploading"}>
              {workflow?.primaryAction === "update-evidence" ? "Actualizar entrega on-chain" : "Enviar entrega on-chain"}
            </button>
          </div>}
          {selected?.submissions && selected.submissions.length > 0 && <div className="submission-list">
            <strong>Entregas registradas ({selected.submissions.length})</strong>
            {selected.submissions.map((submission) => <div key={submission.submitter}>
              <span>{shortAddress(submission.submitter)}</span>
              {submission.evidenceURI
                ? <a href={evidenceHttpUrl(submission.evidenceURI)} target="_blank" rel="noreferrer">Ver evidencia</a>
                : <span>Hash on-chain registrado</span>}
            </div>)}
          </div>}
          {selected && !isResolver && !isArbiter && (
            <p className="help-text">{selectedAwaitingResolution
              ? "Esperando resolución del operador. El escrow permanece protegido y no necesitas enviar otra transacción."
              : "Después del cierre, el operador revisa las entregas y publica el ganador. El pago sale automáticamente del escrow."}</p>
          )}
          {selectedAwaitingResolution && isResolver && <div className="operator-warning">
            <strong>Resolución del bounty</strong>
            <span>La dirección ganadora debe haber enviado previamente una entrega on-chain. Se pagará todo el escrow disponible.</span>
            <label>
              Entrega ganadora
              <select value={winner} onChange={(event) => onWinner(event.target.value)}>
                <option value="">Selecciona una entrega</option>
                {selected?.submissions?.map((submission) => (
                  <option key={submission.submitter} value={submission.submitter}>{shortAddress(submission.submitter)}</option>
                ))}
              </select>
            </label>
            <button onClick={onResolve} disabled={!isAddress(winner) || tx.status === "pending"}>Resolver bounty y pagar</button>
          </div>}
          {selected && selected.state === "Open" && isArbiter && <div className="operator-warning">
            <strong>Cancelación excepcional</strong>
            <input value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Motivo verificable" />
            <button onClick={onCancel} disabled={!reason.trim() || tx.status === "pending"}>Cancelar y devolver escrow</button>
          </div>}
        </div>}
        <TxState tx={tx} />
      </aside>
      </section>
    </section>
  );
}

function BountyCard({
  bounty,
  nowSeconds,
  selected,
  onSelect,
}: {
  bounty: BountyDTO;
  nowSeconds: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const countdown = bountyCountdown(bounty, nowSeconds);
  const deadlineSeconds = Number(bounty.deadline);
  const displayState = bounty.state === "Open" && Number.isFinite(deadlineSeconds) && deadlineSeconds <= nowSeconds
    ? "Esperando resolucion"
    : bounty.state;
  return (
    <article className={selected ? "challenge-card selected" : "challenge-card"}>
      <div className="challenge-card-top"><Trophy size={18} /><strong>{displayState}</strong></div>
      <h3>{bounty.title || `Bounty #${bounty.id}`}</h3>
      <p>{bounty.description || "Entrega verificable requerida."}</p>
      <div className="challenge-meta">
        <span>{formatUsdt(toBigIntAmount(bounty.rewardPool))} aUSDT</span>
        <span>ID #{bounty.id}</span>
      </div>
      {countdown && <time className={`lifecycle-countdown ${countdown.urgency}`} dateTime={countdown.target}>{countdown.label}</time>}
      <button className="entity-select" onClick={() => onSelect(bounty.id)}>{selected ? "Seleccionado" : "Ver bounty"}</button>
    </article>
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
        <StepLine done={!needsApproval} label="Permiso disponible para crear este mercado" action="Autorizar una vez" onAction={onApprove} />
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
  challengeAllowanceLabel,
  bountyAllowanceLabel,
  marketApprovalTargetLabel,
  challengeApprovalTargetLabel,
  bountyApprovalTargetLabel,
  approvalMode,
  marketAllowance,
  challengeAllowance,
  bountyAllowance,
  marketPermissionReady,
  challengePermissionReady,
  bountyPermissionReady,
  marketId,
  tx,
  onMarketId,
  onAddFunds,
  onApprove,
  onApproveChallenge,
  onApproveBounty,
  onApprovalMode,
  onRevokeMarket,
  onRevokeChallenge,
  onRevokeBounty,
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
  challengeAllowanceLabel: string;
  bountyAllowanceLabel: string;
  marketApprovalTargetLabel: string;
  challengeApprovalTargetLabel: string;
  bountyApprovalTargetLabel: string;
  approvalMode: ApprovalMode;
  marketAllowance: bigint;
  challengeAllowance: bigint;
  bountyAllowance: bigint;
  marketPermissionReady: boolean;
  challengePermissionReady: boolean;
  bountyPermissionReady: boolean;
  marketId: string;
  tx: { status: string; label: string; hash?: string; error?: string };
  onMarketId: (value: string) => void;
  onAddFunds: () => void;
  onApprove: () => void;
  onApproveChallenge: () => void;
  onApproveBounty: () => void;
  onApprovalMode: (mode: ApprovalMode) => void;
  onRevokeMarket: () => void;
  onRevokeChallenge: () => void;
  onRevokeBounty: () => void;
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
      <div className="permission-card-wrap">
      <InfoCard title="Permisos de gasto" icon={<ShieldCheck size={18} />}>
        <div className="approval-mode-control" role="group" aria-label="Frecuencia de autorizaciones">
          <button
            className={approvalMode === "smart" ? "selected" : ""}
            aria-pressed={approvalMode === "smart"}
            onClick={() => onApprovalMode("smart")}
          >
            Menos confirmaciones
          </button>
          <button
            className={approvalMode === "exact" ? "selected" : ""}
            aria-pressed={approvalMode === "exact"}
            onClick={() => onApprovalMode("exact")}
          >
            Permiso exacto
          </button>
        </div>
        <span>
          {approvalMode === "smart"
            ? "Autoriza un limite reutilizable pequeno. Se consume con cada uso, nunca es ilimitado y puedes revocarlo cuando quieras."
            : "Autoriza solamente el importe de la operacion actual; normalmente pedira permiso otra vez en la siguiente."}
        </span>
        <div className="permission-list">
          <PermissionRow
            label="Mercados"
            allowanceLabel={allowanceLabel}
            targetLabel={marketApprovalTargetLabel}
            ready={marketPermissionReady}
            canRevoke={marketAllowance > 0n}
            onApprove={onApprove}
            onRevoke={onRevokeMarket}
          />
          <PermissionRow
            label="Retos"
            allowanceLabel={challengeAllowanceLabel}
            targetLabel={challengeApprovalTargetLabel}
            ready={challengePermissionReady}
            canRevoke={challengeAllowance > 0n}
            onApprove={onApproveChallenge}
            onRevoke={onRevokeChallenge}
          />
          <PermissionRow
            label="Bounties"
            allowanceLabel={bountyAllowanceLabel}
            targetLabel={bountyApprovalTargetLabel}
            ready={bountyPermissionReady}
            canRevoke={bountyAllowance > 0n}
            onApprove={onApproveBounty}
            onRevoke={onRevokeBounty}
          />
        </div>
        <small>Autorizar no mueve fondos. Cada apuesta, reto o bounty conserva su propia confirmacion de pago.</small>
      </InfoCard>
      </div>
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

function PermissionRow({
  label,
  allowanceLabel,
  targetLabel,
  ready,
  canRevoke,
  onApprove,
  onRevoke,
}: {
  label: string;
  allowanceLabel: string;
  targetLabel: string;
  ready: boolean;
  canRevoke: boolean;
  onApprove: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="permission-row">
      <div>
        <strong>{label}</strong>
        <span>Disponible: {allowanceLabel}</span>
        {!ready && <small>Proximo limite: {targetLabel}</small>}
      </div>
      <div className="permission-actions">
        {!ready && <button onClick={onApprove}>Autorizar una vez</button>}
        {canRevoke && <button className="text-link" onClick={onRevoke}>Revocar</button>}
        {ready && <span className="permission-ready"><CheckCircle2 size={15} /> Listo</span>}
      </div>
    </div>
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
        {isResolver ? <div className="operator-market-list">
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
        </div> : <div className="operator-market-list participant-resolution-list">
          {resolutionMarkets.length === 0 && <small>No hay mercados esperando resolucion.</small>}
          {resolutionMarkets.map((market) => (
            <article className="operator-market" key={market.id}>
              <div>
                <strong>#{market.id} · Esperando resolucion del operador</strong>
                <span>{market.title}</span>
                <small>Tu apuesta permanece en escrow. No necesitas enviar otra transaccion para que el operador publique el resultado.</small>
              </div>
            </article>
          ))}
        </div>}
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

function FirstRunIntro({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="first-run-intro" aria-label="Guia inicial de Alterford">
      <div>
        <p className="eyebrow">Base Sepolia / Beta funcional</p>
        <h2>Predice. Reta. Demuestra.</h2>
        <p>
          Alterford conecta personas: la plataforma nunca apuesta contra ti. Los fondos quedan
          protegidos en contratos hasta que el resultado se resuelve.
        </p>
      </div>
      <ol>
        <li><strong>1</strong><span>Entra con email o conecta tu wallet.</span></li>
        <li><strong>2</strong><span>Recibe aUSDT de prueba y elige un mercado, reto o bounty.</span></li>
        <li><strong>3</strong><span>Confirma cada operacion y reclama el resultado on-chain.</span></li>
      </ol>
      <div className="intro-action">
        <span>aUSDT y ETH de Base Sepolia no tienen valor real.</span>
        <button className="primary-action" onClick={onDismiss}>Entrar a Alterford</button>
      </div>
    </section>
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

function toMarketViewModel(market: MarketDTO, nowSeconds: number): MarketViewModel {
  const lifecycle = marketAvailability(market, nowSeconds);
  const countdown = marketCountdown(market, nowSeconds);
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
    countdownLabel: countdown?.label,
    countdownUrgency: countdown?.urgency,
    countdownTarget: countdown?.target,
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

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function evidenceHttpUrl(uri: string) {
  if (uri.startsWith("ipfs://")) {
    const cidPath = uri.slice("ipfs://".length).replace(/^ipfs\//, "");
    return `https://ipfs.io/ipfs/${encodeURI(cidPath)}`;
  }
  return /^https:\/\//i.test(uri) ? uri : "#";
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
