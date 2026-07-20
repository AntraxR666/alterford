import {
  BASE_SEPOLIA_CHAIN_ID,
  buildXmrConversionAuthorization,
  buildForwardRequestTypedData,
  bountyBondCategoryId,
  bountyFactoryAbi,
  challengeBondCategoryId,
  challengeFactoryAbi,
  creationBondContextResolverAbi,
  erc20Abi,
  formatAddress,
  formatUsdt,
  marketFactoryAbi,
  marketBondCategoryId,
  type ContractAddresses,
  type CreationBondEstimate,
  type TxLifecycle,
  type XmrConversionAuthorization,
} from "@alterford/sdk";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatEther, keccak256, toBytes, type Address, type Hex } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { configuredAddresses, configuredChainId, hasCoreAddresses } from "../web3/contracts";
import { targetChain } from "../web3/config";
import { approvalTarget } from "../web3/approvalPolicy";
import { ensureProviderChain } from "../web3/chainSwitch";
import {
  missingNativeGasMessage,
  readableSwitchError,
  readableTransactionError,
  type WalletKind,
} from "../web3/transactionErrors";
import type { ApprovalMode } from "../stores/appStore";
import {
  AlterfordGatewayClient,
  isRelayConfigCompatible,
  waitForRelay,
} from "../web3/gatewayClient";

interface TxState {
  status: TxLifecycle;
  label: string;
  hash?: Hex;
  error?: string;
}

export type ChallengeExecutionMode = "wallet" | "gasless";

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface CreateMarketInput {
  question: string;
  category: string;
  closesInMinutes: number;
  resolvesInMinutes: number;
}

export interface CreateChallengeInput {
  title: string;
  stakeUsdt: bigint;
  evidence: string;
  liveStreamURI?: string;
  deadlineMinutes: number;
  riskLevel: "Low" | "Medium" | "High" | "Critical";
}

export interface ChallengeActionInput {
  challengeId: string;
  liveStreamURI?: string;
  evidenceURI?: string;
  reason?: string;
}

export interface CreateBountyInput {
  title: string;
  description: string;
  rewardPool: bigint;
  deadlineMinutes: number;
}

export interface BountyActionInput {
  bountyId: string;
  evidenceURI?: string;
  winner?: Address;
  rewardPool?: bigint;
  reason?: string;
}

export interface ResolveMarketInput {
  marketId: string;
  winningOutcome: 0 | 1;
}

const governedRoleAbi = [
  {
    type: "function",
    name: "RESOLVER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "ARBITER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function useWeb3Flow(
  bondEstimate: CreationBondEstimate,
  quickBetAmount: bigint,
  isUnderworldMode: boolean,
  marketCategory: string,
  challengeBondEstimate: CreationBondEstimate = bondEstimate,
  challengeRewardPool: bigint = 0n,
  bountyBondEstimate: CreationBondEstimate = bondEstimate,
  bountyRewardPool: bigint = 0n,
  isBountyUnderworld = false,
  approvalMode: ApprovalMode = "smart",
) {
  const account = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: configuredChainId() });
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const [tx, setTx] = useState<TxState>({ status: "idle", label: "Ready" });
  const [challengeExecutionMode, setChallengeExecutionMode] = useState<ChallengeExecutionMode>("wallet");
  const [gaslessChallengesAvailable, setGaslessChallengesAvailable] = useState(false);
  const [marketId, setMarketId] = useState("1");
  const [selectedOutcome, setSelectedOutcome] = useState<0 | 1>(0);

  const addresses = useMemo(() => configuredAddresses(), []);
  const contractsReady = hasCoreAddresses(addresses);
  const desiredChainId = configuredChainId();
  const walletKind: WalletKind = account.connector?.id === "web3auth" ? "embedded" : account.connector ? "external" : "unknown";
  const gateway = useMemo(
    () => import.meta.env.VITE_GATEWAY_URL
      ? new AlterfordGatewayClient(import.meta.env.VITE_GATEWAY_URL)
      : null,
    [],
  );
  const onTargetChain = chainId === desiredChainId;
  const marketCategoryId = useMemo(
    () => marketBondCategoryId(marketCategory, isUnderworldMode),
    [isUnderworldMode, marketCategory],
  );
  const challengeCategoryId = useMemo(
    () => challengeBondCategoryId(isUnderworldMode),
    [isUnderworldMode],
  );
  const bountyCategoryId = useMemo(() => bountyBondCategoryId(isBountyUnderworld), [isBountyUnderworld]);

  const marketBondPreview = useReadContract({
    address: addresses.bondContextResolver,
    abi: creationBondContextResolverAbi,
    functionName: "previewBond",
    args:
      account.address && addresses.creationBondPolicy
        ? [addresses.creationBondPolicy, account.address, 0, marketCategoryId, 0n]
        : undefined,
    chainId: desiredChainId,
    query: {
      enabled: Boolean(
        account.address && addresses.creationBondPolicy && addresses.bondContextResolver,
      ),
    },
  });

  const challengeBondPreview = useReadContract({
    address: addresses.bondContextResolver,
    abi: creationBondContextResolverAbi,
    functionName: "previewBond",
    args:
      account.address && addresses.creationBondPolicy
        ? [
            addresses.creationBondPolicy,
            account.address,
            2,
            challengeCategoryId,
            challengeRewardPool,
          ]
        : undefined,
    chainId: desiredChainId,
    query: {
      enabled: Boolean(
        account.address
          && challengeRewardPool > 0n
          && addresses.creationBondPolicy
          && addresses.bondContextResolver,
      ),
    },
  });

  const bountyBondPreview = useReadContract({
    address: addresses.bondContextResolver,
    abi: creationBondContextResolverAbi,
    functionName: "previewBond",
    args:
      account.address && addresses.creationBondPolicy
        ? [addresses.creationBondPolicy, account.address, 1, bountyCategoryId, bountyRewardPool]
        : undefined,
    chainId: desiredChainId,
    query: {
      enabled: Boolean(
        account.address
          && bountyRewardPool > 0n
          && addresses.creationBondPolicy
          && addresses.bondContextResolver,
      ),
    },
  });

  const resolvedBondEstimate = mergeOnchainBondEstimate(bondEstimate, marketBondPreview.data);
  const resolvedChallengeBondEstimate = mergeOnchainBondEstimate(
    challengeBondEstimate,
    challengeBondPreview.data,
  );
  const resolvedBountyBondEstimate = mergeOnchainBondEstimate(bountyBondEstimate, bountyBondPreview.data);
  const requiredApproval = resolvedBondEstimate.amount + quickBetAmount;
  const challengeRequiredApproval = resolvedChallengeBondEstimate.amount + challengeRewardPool;
  const createMarketCost = resolvedBondEstimate.amount;
  const betCost = quickBetAmount;
  const challengeCreateCost = challengeRequiredApproval;
  const challengeExecutorCost = resolvedChallengeBondEstimate.amount;
  const bountyCreateCost = resolvedBountyBondEstimate.amount + bountyRewardPool;
  const marketApprovalTarget = approvalTarget(requiredApproval, approvalMode);
  const marketCreateApprovalTarget = approvalTarget(createMarketCost, approvalMode);
  const betApprovalTarget = approvalTarget(betCost, approvalMode);
  const challengeApprovalTarget = approvalTarget(challengeRequiredApproval, approvalMode);
  const challengeExecutorApprovalTarget = approvalTarget(challengeExecutorCost, approvalMode);
  const bountyApprovalTarget = approvalTarget(bountyCreateCost, approvalMode);

  const balance = useReadContract({
    address: addresses.settlementToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account.address ? [account.address] : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(account.address && addresses.settlementToken) },
  });

  const nativeBalance = useBalance({
    address: account.address,
    chainId: desiredChainId,
    query: { enabled: Boolean(account.address) },
  });

  const allowance = useReadContract({
    address: addresses.settlementToken,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      account.address && addresses.marketFactory
        ? [account.address, addresses.marketFactory]
        : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(account.address && addresses.settlementToken && addresses.marketFactory) },
  });

  const challengeAllowance = useReadContract({
    address: addresses.settlementToken,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      account.address && addresses.challengeFactory
        ? [account.address, addresses.challengeFactory]
        : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(account.address && addresses.settlementToken && addresses.challengeFactory) },
  });

  const bountyAllowance = useReadContract({
    address: addresses.settlementToken,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      account.address && addresses.bountyFactory
        ? [account.address, addresses.bountyFactory]
        : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(account.address && addresses.settlementToken && addresses.bountyFactory) },
  });

  const resolverRole = useReadContract({
    address: addresses.marketFactory,
    abi: governedRoleAbi,
    functionName: "RESOLVER_ROLE",
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.marketFactory) },
  });

  const hasResolverRole = useReadContract({
    address: addresses.marketFactory,
    abi: governedRoleAbi,
    functionName: "hasRole",
    args:
      account.address && resolverRole.data
        ? [resolverRole.data, account.address]
        : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.marketFactory && account.address && resolverRole.data) },
  });

  const arbiterRole = useReadContract({
    address: addresses.challengeFactory,
    abi: governedRoleAbi,
    functionName: "ARBITER_ROLE",
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.challengeFactory) },
  });

  const hasArbiterRole = useReadContract({
    address: addresses.challengeFactory,
    abi: governedRoleAbi,
    functionName: "hasRole",
    args:
      account.address && arbiterRole.data
        ? [arbiterRole.data, account.address]
        : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.challengeFactory && account.address && arbiterRole.data) },
  });

  const bountyResolverRole = useReadContract({
    address: addresses.bountyFactory,
    abi: governedRoleAbi,
    functionName: "RESOLVER_ROLE",
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.bountyFactory) },
  });

  const hasBountyResolverRole = useReadContract({
    address: addresses.bountyFactory,
    abi: governedRoleAbi,
    functionName: "hasRole",
    args: account.address && bountyResolverRole.data ? [bountyResolverRole.data, account.address] : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.bountyFactory && account.address && bountyResolverRole.data) },
  });

  const bountyArbiterRole = useReadContract({
    address: addresses.bountyFactory,
    abi: governedRoleAbi,
    functionName: "ARBITER_ROLE",
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.bountyFactory) },
  });

  const hasBountyArbiterRole = useReadContract({
    address: addresses.bountyFactory,
    abi: governedRoleAbi,
    functionName: "hasRole",
    args: account.address && bountyArbiterRole.data ? [bountyArbiterRole.data, account.address] : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(addresses.bountyFactory && account.address && bountyArbiterRole.data) },
  });

  const currentBalance = (balance.data as bigint | undefined) ?? 0n;
  const currentNativeBalance = nativeBalance.data?.value ?? 0n;
  const currentAllowance = (allowance.data as bigint | undefined) ?? 0n;
  const currentChallengeAllowance = (challengeAllowance.data as bigint | undefined) ?? 0n;
  const currentBountyAllowance = (bountyAllowance.data as bigint | undefined) ?? 0n;
  const needsApproval = currentAllowance < requiredApproval;
  const needsChallengeApproval = currentChallengeAllowance < challengeRequiredApproval;
  const hasEnoughBalance = currentBalance >= requiredApproval;
  const hasEnoughChallengeBalance = currentBalance >= challengeRequiredApproval;
  const needsCreateApproval = currentAllowance < createMarketCost;
  const hasEnoughCreateBalance = currentBalance >= createMarketCost;
  const needsBetApproval = currentAllowance < betCost;
  const hasEnoughBetBalance = currentBalance >= betCost;
  const needsChallengeExecutorApproval = currentChallengeAllowance < challengeExecutorCost;
  const hasEnoughChallengeExecutorBalance = currentBalance >= challengeExecutorCost;
  const needsBountyApproval = currentBountyAllowance < bountyCreateCost;
  const hasEnoughBountyBalance = currentBalance >= bountyCreateCost;
  const spendPreview = {
    createMarket: bondEstimate.amount,
    placeBet: quickBetAmount,
    totalSetup: requiredApproval,
  };
  const hasInjectedProvider = Boolean((globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum);
  const preferredConnectorName = hasInjectedProvider ? "wallet" : "WalletConnect";
  const socialConnector = connectors.find((item) => item.id === "web3auth");
  const hasSocialLogin = Boolean(socialConnector);

  useEffect(() => {
    const forwarder = addresses.alterfordForwarder;
    const marketFactory = addresses.marketFactory;
    const bountyFactory = addresses.bountyFactory;
    const challengeFactory = addresses.challengeFactory;
    if (!gateway || !forwarder || !marketFactory || !bountyFactory || !challengeFactory) {
      setGaslessChallengesAvailable(false);
      setChallengeExecutionMode("wallet");
      return;
    }
    let active = true;
    gateway.config()
      .then((config) => {
        if (!active) return;
        const available = isRelayConfigCompatible(config, {
          chainId: desiredChainId,
          marketFactory,
          bountyFactory,
          challengeFactory,
          forwarder,
        });
        setGaslessChallengesAvailable(available);
        if (!available) setChallengeExecutionMode("wallet");
      })
      .catch(() => {
        if (!active) return;
        setGaslessChallengesAvailable(false);
        setChallengeExecutionMode("wallet");
      });
    return () => {
      active = false;
    };
  }, [
    addresses.alterfordForwarder,
    addresses.marketFactory,
    addresses.bountyFactory,
    addresses.challengeFactory,
    desiredChainId,
    gateway,
  ]);

  async function connectWallet() {
    const connector = hasInjectedProvider
      ? connectors.find((item) => item.id.toLowerCase().includes("injected")) ?? connectors[0]
      : connectors.find((item) => item.id.toLowerCase().includes("walletconnect"))
        ?? connectors.find((item) => item.name.toLowerCase().includes("walletconnect"))
        ?? connectors[0];
    await connectAsync({ connector });
  }

  async function connectSocialWallet() {
    if (!socialConnector) {
      throw new Error("El acceso por email no esta configurado en este entorno.");
    }
    await connectAsync({ connector: socialConnector, chainId: desiredChainId });
  }

  async function switchToTargetChain(): Promise<boolean> {
    const targetChainId = desiredChainId || BASE_SEPOLIA_CHAIN_ID;
    try {
      setTx({ status: "pending", label: `Cambiando a ${targetChain.name}` });
      await switchChainAsync({ chainId: targetChainId });
      setTx({ status: "confirmed", label: `Red activa: ${targetChain.name}` });
      return true;
    } catch (error) {
      if (walletKind === "embedded") {
        const provider = await providerFromConnector(account.connector);
        if (await ensureProviderChain(provider, targetChainId, targetChain)) {
          setTx({ status: "confirmed", label: `Red activa: ${targetChain.name}` });
          return true;
        }
        setTx({
          status: "failed",
          label: `Cambiar a ${targetChain.name}`,
          error: readableSwitchError(error, { walletKind, targetChainName: targetChain.name }),
        });
        return false;
      }
      try {
        await switchWithInjectedFallback(targetChainId);
        setTx({ status: "confirmed", label: `Red activa: ${targetChain.name}` });
        return true;
      } catch (fallbackError) {
        setTx({
          status: "failed",
          label: `Cambiar a ${targetChain.name}`,
          error: readableSwitchError(fallbackError || error, { walletKind, targetChainName: targetChain.name }),
        });
        return false;
      }
    }
  }

  async function runTx(label: string, action: (contracts: ContractAddresses) => Promise<`0x${string}`>) {
    if (!contractsReady) {
      setTx({ status: "failed", label, error: "Contract addresses are missing for this network." });
      return;
    }
    if (!account.address) {
      setTx({ status: "failed", label, error: "Connect a wallet before sending a transaction." });
      return;
    }
    if (!publicClient) {
      setTx({ status: "failed", label, error: "RPC client unavailable. Check network configuration." });
      return;
    }
    if (currentNativeBalance <= 0n) {
      setTx({
        status: "failed",
        label,
        error: missingNativeGasMessage({ walletKind, targetChainName: targetChain.name }),
      });
      return;
    }

    try {
      if (!onTargetChain) {
        const switched = await switchToTargetChain();
        if (!switched) return;
      }
      setTx({ status: "pending", label });
      const hash = await action(addresses);
      setTx({ status: "pending", label, hash });
      await publicClient.waitForTransactionReceipt({ hash });
      setTx({ status: "confirmed", label, hash });
      notifyChainUpdated();
      await Promise.allSettled([
        balance.refetch(),
        nativeBalance.refetch(),
        allowance.refetch(),
        challengeAllowance.refetch(),
        bountyAllowance.refetch(),
      ]);
    } catch (error) {
      setTx({ status: "failed", label, error: readableTransactionError(error, { walletKind, targetChainName: targetChain.name }) });
    }
  }

  async function runSponsoredTx(
    label: string,
    target: Address | undefined,
    data: Hex,
    directAction: (contracts: ContractAddresses) => Promise<Hex>,
    sponsor = challengeExecutionMode === "gasless" || walletKind === "embedded",
  ) {
    if (!sponsor) {
      await runTx(label, directAction);
      return;
    }
    const forwarder = addresses.alterfordForwarder;
    if (!gaslessChallengesAvailable || !gateway || !forwarder || !target) {
      if (walletKind !== "embedded") setChallengeExecutionMode("wallet");
      setTx({
        status: "failed",
        label: `${label}: patrocinio no disponible`,
        error: "No se firmo ni se movieron fondos. Alterford cambio a modo Wallet para el siguiente intento.",
      });
      return;
    }
    if (!contractsReady || !account.address || !publicClient) {
      await runTx(label, directAction);
      return;
    }

    try {
      if (!onTargetChain) {
        const switched = await switchToTargetChain();
        if (!switched) return;
      }
      setTx({ status: "pending", label: `${label}: firma sin gas` });
      const prepared = await gateway.prepareRelay({
        chainId: desiredChainId,
        user: account.address,
        target,
        data,
      });
      const request = prepared.request;
      if (
        request.from.toLowerCase() !== account.address.toLowerCase()
        || request.to.toLowerCase() !== target.toLowerCase()
        || request.data.toLowerCase() !== data.toLowerCase()
        || request.value !== 0n
        || request.gas <= 0n
        || request.gas > 2_000_000n
        || request.deadline <= Math.floor(Date.now() / 1_000)
      ) {
        throw new Error("El gateway devolvio una solicitud de patrocinio invalida.");
      }
      const signature = await signTypedDataAsync(
        buildForwardRequestTypedData(desiredChainId, forwarder, request),
      );
      setTx({ status: "pending", label: `${label}: enviando sin gas` });
      const submission = await gateway.submitRelay({
        request: { ...request, signature },
        idempotencyKey: `relay-${crypto.randomUUID()}`,
      });
      const result = await waitForRelay(gateway, submission.taskId);
      if (result.state !== "confirmed") throw new Error("El relay no pudo ejecutar la accion.");
      setTx({ status: "confirmed", label: `${label}: confirmado sin gas`, hash: result.transactionHash });
      notifyChainUpdated();
      await Promise.allSettled([
        balance.refetch(),
        nativeBalance.refetch(),
        allowance.refetch(),
        challengeAllowance.refetch(),
        bountyAllowance.refetch(),
      ]);
    } catch (error) {
      const detail = readableTransactionError(error, { walletKind, targetChainName: targetChain.name });
      const relayStillPending = /sigue pendiente/i.test(detail);
      if (!relayStillPending && walletKind !== "embedded") setChallengeExecutionMode("wallet");
      setTx({
        status: "failed",
        label: relayStillPending ? `${label}: relay pendiente` : `${label}: firma sin gas no ejecutada`,
        error: relayStillPending
          ? detail
          : `${detail} No se movieron aUSDT. El siguiente intento usara una transaccion Wallet normal.`,
      });
    }
  }

  async function runChallengeTx(
    label: string,
    data: Hex,
    directAction: (contracts: ContractAddresses) => Promise<Hex>,
  ) {
    await runSponsoredTx(label, addresses.challengeFactory, data, directAction);
  }

  async function signSettlementPermit(spender: Address, value: bigint) {
    if (!account.address || !publicClient || !addresses.settlementToken) {
      throw new Error("Conecta una wallet y espera la configuracion del token antes de firmar el permiso.");
    }
    const [nonce, tokenName] = await Promise.all([
      publicClient.readContract({
        address: addresses.settlementToken,
        abi: erc20Abi,
        functionName: "nonces",
        args: [account.address],
      }),
      publicClient.readContract({
        address: addresses.settlementToken,
        abi: erc20Abi,
        functionName: "name",
      }),
    ]);
    const deadline = BigInt(Math.floor(Date.now() / 1_000) + 10 * 60);
    const signature = await signTypedDataAsync({
      domain: {
        name: tokenName as string,
        version: "1",
        chainId: desiredChainId,
        verifyingContract: addresses.settlementToken,
      },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: { owner: account.address, spender, value, nonce: nonce as bigint, deadline },
    });
    return permitDataFromSignature(value, deadline, signature);
  }

  function selectChallengeExecutionMode(mode: ChallengeExecutionMode) {
    if (mode === "gasless" && !gaslessChallengesAvailable) {
      setTx({
        status: "failed",
        label: "Patrocinio no disponible",
        error: "El gateway no confirmo patrocinio para este deployment. Usa Wallet; no se movieron fondos.",
      });
      return;
    }
    setChallengeExecutionMode(mode);
  }

  function guardedTx(label: string, checks: Array<[boolean, string]>, send: () => void) {
    const failed = checks.find(([passed]) => !passed);
    if (failed) {
      setTx({ status: "failed", label, error: failed[1] });
      return;
    }
    send();
  }

  const approveMarketAmount = (amount: bigint, label: string) =>
    runTx(label, (contracts) =>
      writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.marketFactory, amount],
      }),
    );

  const approveSettlement = () => approveMarketAmount(marketApprovalTarget, "Autorizar mercados");
  const approveMarketCreation = () => approveMarketAmount(marketCreateApprovalTarget, "Autorizar creacion de mercado");
  const approveBetSettlement = () => approveMarketAmount(betApprovalTarget, "Autorizar predicciones");

  const approveChallengeSettlement = () =>
    runTx(`Autorizar reto ${isUnderworldMode ? "Underworld" : "Vanilla"}`, (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.challengeFactory, challengeApprovalTarget],
      });
    });

  const approveChallengeExecutorBond = () =>
    runTx("Autorizar bond de ejecutor", (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.challengeFactory, challengeExecutorApprovalTarget],
      });
    });

  const approveChallengeDispute = (input: ChallengeActionInput) =>
    runTx("Autorizar bond de disputa", async (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      const disputeBond = await publicClient!.readContract({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "disputeBondFor",
        args: [BigInt(input.challengeId || "1")],
      });
      return writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.challengeFactory, approvalTarget(disputeBond as bigint, approvalMode)],
      });
    });

  const approveBountySettlement = () =>
    runTx("Autorizar bounty", (contracts) => {
      if (!contracts.bountyFactory) throw new Error("BountyFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.bountyFactory, bountyApprovalTarget],
      });
    });

  const revokeMarketApproval = () => approveMarketAmount(0n, "Revocar permiso de mercados");
  const revokeChallengeApproval = () =>
    runTx("Revocar permiso de retos", (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.challengeFactory, 0n],
      });
    });
  const revokeBountyApproval = () =>
    runTx("Revocar permiso de bounties", (contracts) => {
      if (!contracts.bountyFactory) throw new Error("BountyFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.bountyFactory, 0n],
      });
    });

  const mintTestTokens = () =>
    guardedTx(
      "Agregar fondos de prueba",
      [[currentNativeBalance > 0n, "Necesitas una pequena cantidad de ETH en Base Sepolia para pagar el gas del faucet."]],
      () => runTx("Agregar fondos de prueba", (contracts) =>
        writeContractAsync({
          address: contracts.settlementToken,
          abi: erc20Abi,
          functionName: "mint",
          chainId: desiredChainId,
          args: [account.address as Address, 100_000_000n],
        }),
      ),
    );

  const createMarket = (input?: CreateMarketInput) =>
    guardedTx(
      "Crear mercado",
      [
        [hasEnoughCreateBalance, `Necesitas ${formatUsdt(createMarketCost)} aUSDT para bloquear el bond del mercado.`],
        [!needsCreateApproval || gaslessChallengesAvailable, "Primero autoriza aUSDT para crear el mercado."],
      ],
      async () => {
        const metadataURI = buildMarketMetadataURI(input, isUnderworldMode);
        const args = [
          addresses.settlementToken!,
          keccak256(toBytes(`${input?.question || "alterford-market"}-${Date.now()}`)),
          metadataURI,
          ["YES", "NO"],
          BigInt(Math.floor(Date.now() / 1000) + Math.max(5, input?.closesInMinutes ?? 60) * 60),
          BigInt(Math.floor(Date.now() / 1000) + Math.max(10, input?.resolvesInMinutes ?? 120) * 60),
          0,
          marketBondCategoryId(input?.category || marketCategory, isUnderworldMode),
        ] as const;
        const sponsor = gaslessChallengesAvailable && (challengeExecutionMode === "gasless" || walletKind === "embedded");
        if (sponsor) {
          if (!addresses.marketFactory) throw new Error("MarketFactory is not configured for this network.");
          const permitData = await signSettlementPermit(addresses.marketFactory, createMarketCost);
          const sponsoredArgs = [...args, permitData] as const;
          await runSponsoredTx("Crear mercado", addresses.marketFactory, encodeFunctionData({
            abi: marketFactoryAbi,
            functionName: "createMarketWithPermit",
            args: sponsoredArgs,
          }), () => writeContractAsync({
            address: addresses.marketFactory!, abi: marketFactoryAbi, functionName: "createMarketWithPermit",
            chainId: desiredChainId, args: sponsoredArgs,
          }), true);
          return;
        }
        await runTx("Crear mercado", (contracts) => writeContractAsync({
          address: contracts.marketFactory, abi: marketFactoryAbi, functionName: "createMarket",
          chainId: desiredChainId, args,
        }));
      },
    );

  const createChallengeLabel = isUnderworldMode ? "Crear reto Underworld" : "Crear reto Vanilla";
  const createChallenge = (input: CreateChallengeInput) =>
    guardedTx(
      createChallengeLabel,
      [
        [hasEnoughChallengeBalance, `Necesitas ${formatUsdt(challengeCreateCost)} aUSDT para recompensa + bond.`],
        [!needsChallengeApproval || gaslessChallengesAvailable, `Primero autoriza aUSDT para el reto ${isUnderworldMode ? "Underworld" : "Vanilla"}.`],
      ],
      async () => {
      const challengeFactory = addresses.challengeFactory;
      if (!challengeFactory || !addresses.settlementToken) throw new Error("ChallengeFactory is not configured for this network.");
      const metadataURI = buildChallengeMetadataURI(input, isUnderworldMode);
      const metadataSeed = `${input.title}-${input.evidence}-${input.stakeUsdt.toString()}-${Date.now()}`;
      const highRiskOrValue =
        input.stakeUsdt >= 1_000_000_000n || input.riskLevel === "High" || input.riskLevel === "Critical";
      const maxDeadlineMinutes = highRiskOrValue ? 2_880 : 1_440;
      const args = [
        addresses.settlementToken,
        input.stakeUsdt,
        keccak256(toBytes(metadataSeed)),
        metadataURI,
        BigInt(
          Math.floor(Date.now() / 1000)
            + Math.min(maxDeadlineMinutes, Math.max(30, input.deadlineMinutes)) * 60,
        ),
        challengeCategoryId,
      ] as const;
      const sponsor = gaslessChallengesAvailable && (challengeExecutionMode === "gasless" || walletKind === "embedded");
      if (sponsor) {
        const permitData = await signSettlementPermit(challengeFactory, challengeCreateCost);
        const sponsoredArgs = [...args, permitData] as const;
        return runSponsoredTx(createChallengeLabel, challengeFactory, encodeFunctionData({
          abi: challengeFactoryAbi, functionName: "createChallengeWithPermit", args: sponsoredArgs,
        }), () => writeContractAsync({
          address: challengeFactory, abi: challengeFactoryAbi, functionName: "createChallengeWithPermit",
          chainId: desiredChainId, args: sponsoredArgs,
        }), true);
      }
      return runChallengeTx(createChallengeLabel, encodeFunctionData({
        abi: challengeFactoryAbi, functionName: "createChallenge", args,
      }), () => writeContractAsync({
        address: challengeFactory, abi: challengeFactoryAbi, functionName: "createChallenge", chainId: desiredChainId, args,
      }));
      },
    );

  const createBounty = (input: CreateBountyInput) =>
    guardedTx(
      "Crear bounty",
      [
        [input.rewardPool > 0n, "La recompensa debe ser mayor que cero."],
        [hasEnoughBountyBalance, `Necesitas ${formatUsdt(bountyCreateCost)} aUSDT para recompensa + bond.`],
        [!needsBountyApproval || gaslessChallengesAvailable, "Primero prepara el permiso de aUSDT para este bounty."],
      ],
      async () => {
        if (!addresses.bountyFactory || !addresses.settlementToken) throw new Error("BountyFactory is not configured for this network.");
        const metadataURI = buildBountyMetadataURI(input, isBountyUnderworld);
        const rulesHash = keccak256(toBytes(`${input.title}-${input.description}-${Date.now()}`));
        const args = [
          addresses.settlementToken, input.rewardPool,
          BigInt(Math.floor(Date.now() / 1_000) + Math.max(60, input.deadlineMinutes) * 60),
          rulesHash, metadataURI, bountyCategoryId,
        ] as const;
        const sponsor = gaslessChallengesAvailable && (challengeExecutionMode === "gasless" || walletKind === "embedded");
        if (sponsor) {
          const permitData = await signSettlementPermit(addresses.bountyFactory, bountyCreateCost);
          const sponsoredArgs = [...args, permitData] as const;
          await runSponsoredTx("Crear bounty", addresses.bountyFactory, encodeFunctionData({
            abi: bountyFactoryAbi, functionName: "createBountyWithPermit", args: sponsoredArgs,
          }), () => writeContractAsync({
            address: addresses.bountyFactory!, abi: bountyFactoryAbi, functionName: "createBountyWithPermit",
            chainId: desiredChainId, args: sponsoredArgs,
          }), true);
          return;
        }
        await runTx("Crear bounty", (contracts) => writeContractAsync({
          address: contracts.bountyFactory!, abi: bountyFactoryAbi, functionName: "createBounty",
          chainId: desiredChainId, args,
        }));
      },
    );

  const submitBounty = (input: BountyActionInput) =>
    guardedTx(
      "Enviar propuesta al bounty",
      [[Boolean(input.evidenceURI?.trim()), "Añade una URL o referencia de evidencia antes de enviar."]],
      async () => {
        if (!addresses.bountyFactory) throw new Error("BountyFactory is not configured for this network.");
        const args = [
          BigInt(input.bountyId || "1"), keccak256(toBytes(input.evidenceURI!.trim())), input.evidenceURI!.trim(),
        ] as const;
        await runSponsoredTx("Enviar propuesta al bounty", addresses.bountyFactory, encodeFunctionData({
          abi: bountyFactoryAbi, functionName: "submitEvidence", args,
        }), () => writeContractAsync({
          address: addresses.bountyFactory!, abi: bountyFactoryAbi, functionName: "submitEvidence",
          chainId: desiredChainId, args,
        }));
      },
    );

  const resolveBounty = (input: BountyActionInput) =>
    guardedTx(
      "Resolver bounty",
      [
        [hasBountyResolverRole.data === true, "Esta wallet no tiene RESOLVER_ROLE para bounties."],
        [Boolean(input.winner), "Selecciona una direccion ganadora valida."],
        [Boolean(input.rewardPool && input.rewardPool > 0n), "El payout debe ser mayor que cero."],
      ],
      () => runTx("Resolver bounty", (contracts) => {
        if (!contracts.bountyFactory) throw new Error("BountyFactory is not configured for this network.");
        return writeContractAsync({
          address: contracts.bountyFactory,
          abi: bountyFactoryAbi,
          functionName: "resolveBounty",
          chainId: desiredChainId,
          args: [BigInt(input.bountyId || "1"), [input.winner!], [input.rewardPool!]],
        });
      }),
    );

  const cancelBounty = (input: BountyActionInput) =>
    guardedTx(
      "Cancelar bounty",
      [[hasBountyArbiterRole.data === true, "Esta wallet no tiene ARBITER_ROLE para bounties."]],
      () => runTx("Cancelar bounty", (contracts) => {
        if (!contracts.bountyFactory) throw new Error("BountyFactory is not configured for this network.");
        return writeContractAsync({
          address: contracts.bountyFactory,
          abi: bountyFactoryAbi,
          functionName: "cancelBounty",
          chainId: desiredChainId,
          args: [
            BigInt(input.bountyId || "1"),
            keccak256(toBytes(input.reason?.trim() || "operator-cancel")),
          ],
        });
      }),
    );

  const acceptChallenge = (input: ChallengeActionInput) =>
    guardedTx(
      "Aceptar reto",
      [
        [hasEnoughChallengeExecutorBalance, `Necesitas ${formatUsdt(challengeExecutorCost)} aUSDT para el bond de ejecutor.`],
        [!needsChallengeExecutorApproval || gaslessChallengesAvailable, "Primero autoriza aUSDT para aceptar retos."],
      ],
      async () => {
      const challengeFactory = addresses.challengeFactory;
      if (!challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      const args = [BigInt(input.challengeId || "1"), input.liveStreamURI || ""] as const;
      const sponsor = gaslessChallengesAvailable && (challengeExecutionMode === "gasless" || walletKind === "embedded");
      if (sponsor) {
        const permitData = await signSettlementPermit(challengeFactory, challengeExecutorCost);
        const sponsoredArgs = [...args, permitData] as const;
        return runSponsoredTx("Aceptar reto", challengeFactory, encodeFunctionData({
          abi: challengeFactoryAbi, functionName: "acceptChallengeWithPermit", args: sponsoredArgs,
        }), () => writeContractAsync({
          address: challengeFactory, abi: challengeFactoryAbi, functionName: "acceptChallengeWithPermit",
          chainId: desiredChainId, args: sponsoredArgs,
        }), true);
      }
      return runChallengeTx("Aceptar reto", encodeFunctionData({
        abi: challengeFactoryAbi, functionName: "acceptChallenge", args,
      }), () => writeContractAsync({
        address: challengeFactory, abi: challengeFactoryAbi, functionName: "acceptChallenge", chainId: desiredChainId, args,
      }));
      },
    );

  const updateChallengeLiveStream = (input: ChallengeActionInput) => {
    const args = [BigInt(input.challengeId || "1"), input.liveStreamURI || ""] as const;
    return runChallengeTx("Actualizar live del reto", encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "updateLiveStreamURI",
      args,
    }), (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "updateLiveStreamURI",
        chainId: desiredChainId,
        args,
      });
    });
  };

  const submitChallengeEvidence = (input: ChallengeActionInput) => {
    const evidenceURI = input.evidenceURI || input.liveStreamURI || `ipfs://alterford/evidence/${Date.now()}`;
    const args = [
      BigInt(input.challengeId || "1"),
      keccak256(toBytes(evidenceURI)),
      evidenceURI,
      input.liveStreamURI || "",
    ] as const;
    return runChallengeTx("Enviar evidencia del reto", encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "submitEvidence",
      args,
    }), (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "submitEvidence",
        chainId: desiredChainId,
        args,
      });
    });
  };

  const proposeChallengeResolution = (
    input: ChallengeActionInput & { executorSucceeded: boolean },
  ) => {
    const evidenceReference = input.evidenceURI || input.liveStreamURI || "";
    const args = [
      BigInt(input.challengeId || "1"),
      input.executorSucceeded,
      evidenceReference ? keccak256(toBytes(evidenceReference)) : keccak256(toBytes("no-evidence")),
    ] as const;
    return runChallengeTx("Proponer resultado del reto", encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "proposeResolution",
      args,
    }), (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "proposeResolution",
        chainId: desiredChainId,
        args,
      });
    });
  };

  const confirmChallengeResolution = (
    input: ChallengeActionInput & { executorSucceeded: boolean },
  ) => {
    const args = [BigInt(input.challengeId || "1"), input.executorSucceeded] as const;
    return runChallengeTx("Confirmar resultado del reto", encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "confirmResolution",
      args,
    }), (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "confirmResolution",
        chainId: desiredChainId,
        args,
      });
    });
  };

  const disputeChallengeResolution = (input: ChallengeActionInput) => {
    const args = [
      BigInt(input.challengeId || "1"),
      keccak256(toBytes(input.reason || "challenge-dispute")),
    ] as const;
    return runChallengeTx("Abrir disputa del reto", encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "disputeResolution",
      args,
    }), (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "disputeResolution",
        chainId: desiredChainId,
        args,
      });
    });
  };

  const finalizeUndisputedChallenge = (input: ChallengeActionInput) => {
    const args = [BigInt(input.challengeId || "1")] as const;
    return runChallengeTx("Finalizar reto sin disputa", encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "finalizeUndisputed",
      args,
    }), (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "finalizeUndisputed",
        chainId: desiredChainId,
        args,
      });
    });
  };

  const resolveChallengeDispute = (
    input: ChallengeActionInput & { executorSucceeded: boolean },
  ) =>
    runTx("Resolver disputa como arbitro", (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "resolveDispute",
        chainId: desiredChainId,
        args: [
          BigInt(input.challengeId || "1"),
          input.executorSucceeded,
          keccak256(toBytes(input.reason || "arbiter-dispute-resolution")),
        ],
      });
    });

  const resolveChallenge = (input: ChallengeActionInput & { executorSucceeded: boolean }) =>
    runTx("Resolver reto", (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "resolveChallenge",
        chainId: desiredChainId,
        args: [
          BigInt(input.challengeId || "1"),
          input.executorSucceeded,
          false,
          !input.executorSucceeded,
          keccak256(toBytes(input.reason || "operator-resolution")),
        ],
      });
    });

  const cancelChallenge = (input: ChallengeActionInput) =>
    runTx("Cancelar reto", (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "cancelChallenge",
        chainId: desiredChainId,
        args: [BigInt(input.challengeId || "1"), keccak256(toBytes(input.reason || "operator-cancel"))],
      });
    });

  const placeBet = () =>
    guardedTx(
      "Confirmar prediccion",
      [
        [hasEnoughBetBalance, `Necesitas ${formatUsdt(betCost)} aUSDT para esta prediccion.`],
        [!needsBetApproval || gaslessChallengesAvailable, "Primero autoriza aUSDT para apostar."],
      ],
      async () => {
        if (!addresses.marketFactory) throw new Error("MarketFactory is not configured for this network.");
        const args = [BigInt(marketId || "1"), selectedOutcome, quickBetAmount] as const;
        const sponsor = gaslessChallengesAvailable && (challengeExecutionMode === "gasless" || walletKind === "embedded");
        if (sponsor) {
          const permitData = await signSettlementPermit(addresses.marketFactory, betCost);
          const sponsoredArgs = [...args, permitData] as const;
          await runSponsoredTx("Confirmar prediccion", addresses.marketFactory, encodeFunctionData({
            abi: marketFactoryAbi, functionName: "placeBetWithPermit", args: sponsoredArgs,
          }), () => writeContractAsync({
            address: addresses.marketFactory!, abi: marketFactoryAbi, functionName: "placeBetWithPermit",
            chainId: desiredChainId, args: sponsoredArgs,
          }), true);
          return;
        }
        await runTx("Confirmar prediccion", (contracts) => writeContractAsync({
          address: contracts.marketFactory, abi: marketFactoryAbi, functionName: "placeBet",
          chainId: desiredChainId, args,
        }));
      },
    );

  const resolveMarket = (input: ResolveMarketInput) =>
    runTx("Resolver mercado", (contracts) =>
      writeContractAsync({
        address: contracts.marketFactory,
        abi: marketFactoryAbi,
        functionName: "resolveMarket",
        chainId: desiredChainId,
        args: [BigInt(input.marketId), input.winningOutcome],
      }),
    );

  const claimReward = async () => {
    if (!addresses.marketFactory) throw new Error("MarketFactory is not configured for this network.");
    const args = [BigInt(marketId || "1")] as const;
    await runSponsoredTx("Cobrar ganancia", addresses.marketFactory, encodeFunctionData({
      abi: marketFactoryAbi, functionName: "claimReward", args,
    }), () => writeContractAsync({
      address: addresses.marketFactory!, abi: marketFactoryAbi, functionName: "claimReward", chainId: desiredChainId, args,
    }));
  };

  const claimRefund = async () => {
    if (!addresses.marketFactory) throw new Error("MarketFactory is not configured for this network.");
    const args = [BigInt(marketId || "1")] as const;
    await runSponsoredTx("Recibir reembolso", addresses.marketFactory, encodeFunctionData({
      abi: marketFactoryAbi, functionName: "claimRefund", args,
    }), () => writeContractAsync({
      address: addresses.marketFactory!, abi: marketFactoryAbi, functionName: "claimRefund", chainId: desiredChainId, args,
    }));
  };

  async function signXmrConversionAuthorization(input: XmrConversionAuthorization) {
    if (!account.address || account.address.toLowerCase() !== input.destination.toLowerCase()) {
      throw new Error("La wallet conectada no coincide con la direccion que recibira el USDC.");
    }
    if (!onTargetChain) {
      throw new Error(`Cambia a ${targetChain.name} antes de autorizar la conversion.`);
    }
    return signTypedDataAsync(buildXmrConversionAuthorization(desiredChainId, input));
  }

  return {
    account,
    chainId,
    connectors,
    preferredConnectorName,
    hasSocialLogin,
    isConnecting,
    isSwitching,
    desiredChainId,
    onTargetChain,
    contractsReady,
    gaslessChallengesAvailable,
    challengeExecutionMode,
    isMarketResolver: hasResolverRole.data === true,
    isChallengeArbiter: hasArbiterRole.data === true,
    isBountyResolver: hasBountyResolverRole.data === true,
    isBountyArbiter: hasBountyArbiterRole.data === true,
    bondEstimate: resolvedBondEstimate,
    challengeBondEstimate: resolvedChallengeBondEstimate,
    bountyBondEstimate: resolvedBountyBondEstimate,
    addresses,
    balance: currentBalance,
    allowance: currentAllowance,
    challengeAllowance: currentChallengeAllowance,
    bountyAllowance: currentBountyAllowance,
    requiredApproval,
    challengeRequiredApproval,
    marketApprovalTarget,
    challengeApprovalTarget,
    bountyApprovalTarget,
    needsApproval,
    needsChallengeApproval,
    hasEnoughBalance,
    hasEnoughChallengeBalance,
    needsBountyApproval,
    hasEnoughBountyBalance,
    needsCreateApproval,
    hasEnoughCreateBalance,
    needsBetApproval,
    hasEnoughBetBalance,
    needsChallengeExecutorApproval,
    hasEnoughChallengeExecutorBalance,
    spendPreview,
    tx,
    marketId,
    selectedOutcome,
    setMarketId,
    setSelectedOutcome,
    connectWallet,
    connectSocialWallet,
    selectChallengeExecutionMode,
    disconnect,
    switchToTargetChain,
    approveSettlement,
    approveMarketCreation,
    approveBetSettlement,
    approveChallengeSettlement,
    approveChallengeExecutorBond,
    approveChallengeDispute,
    approveBountySettlement,
    revokeMarketApproval,
    revokeChallengeApproval,
    revokeBountyApproval,
    mintTestTokens,
    createMarket,
    createChallenge,
    createBounty,
    submitBounty,
    resolveBounty,
    cancelBounty,
    acceptChallenge,
    updateChallengeLiveStream,
    submitChallengeEvidence,
    proposeChallengeResolution,
    confirmChallengeResolution,
    disputeChallengeResolution,
    finalizeUndisputedChallenge,
    resolveChallengeDispute,
    resolveChallenge,
    cancelChallenge,
    placeBet,
    resolveMarket,
    claimReward,
    claimRefund,
    signXmrConversionAuthorization,
    accountLabel: formatAddress(account.address),
    gasBalanceLabel: `${formatEther(currentNativeBalance)} ETH`,
    balanceLabel: `${formatUsdt(currentBalance)} aUSDT`,
    allowanceLabel: `${formatUsdt(currentAllowance)} aUSDT`,
    challengeAllowanceLabel: `${formatUsdt(currentChallengeAllowance)} aUSDT`,
    bountyAllowanceLabel: `${formatUsdt(currentBountyAllowance)} aUSDT`,
    marketApprovalTargetLabel: `${formatUsdt(marketApprovalTarget)} aUSDT`,
    challengeApprovalTargetLabel: `${formatUsdt(challengeApprovalTarget)} aUSDT`,
    bountyApprovalTargetLabel: `${formatUsdt(bountyApprovalTarget)} aUSDT`,
    challengeTotalCostLabel: `${formatUsdt(challengeRequiredApproval)} aUSDT`,
    bountyTotalCostLabel: `${formatUsdt(bountyCreateCost)} aUSDT`,
    createCostLabel: `${formatUsdt(resolvedBondEstimate.amount)} aUSDT bond`,
    betCostLabel: `${formatUsdt(quickBetAmount)} aUSDT`,
  };
}

function mergeOnchainBondEstimate(
  fallback: CreationBondEstimate,
  preview: readonly [bigint, number] | undefined,
): CreationBondEstimate {
  if (!preview) return fallback;
  return {
    ...fallback,
    amount: preview[0],
    reasonFlags: Number(preview[1]),
    reasons: ["Monto exacto on-chain según categoría y perfil verificados."],
  };
}

function buildChallengeMetadataURI(input: CreateChallengeInput, underworld: boolean): string {
  const params = new URLSearchParams({
    title: input.title.trim() || `Reto ${underworld ? "Underworld" : "Vanilla"}`,
    evidence: input.evidence.trim() || "Evidencia pendiente",
    live: input.liveStreamURI?.trim() || "",
    mode: underworld ? "Underworld" : "Vanilla",
    description: "Reto creado por usuario en Alterford.",
  });
  return `alterford://challenge?${params.toString()}`;
}

function buildBountyMetadataURI(input: CreateBountyInput, underworld: boolean): string {
  const params = new URLSearchParams({
    title: input.title.trim() || "Bounty Alterford",
    description: input.description.trim() || "Entrega verificable requerida.",
    mode: underworld ? "Underworld" : "Vanilla",
  });
  return `alterford://bounty?${params.toString()}`;
}

async function switchWithInjectedFallback(chainId: number) {
  const ethereum = (globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum;
  if (!ethereum?.request) {
    throw new Error("No injected wallet provider is available.");
  }

  const chainIdHex = `0x${chainId.toString(16)}`;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if (getErrorCode(error) !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: targetChain.name,
          nativeCurrency: targetChain.nativeCurrency,
          rpcUrls: [...targetChain.rpcUrls.default.http],
          blockExplorerUrls: getBlockExplorerUrls(),
        },
      ],
    });
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  }
}

function notifyChainUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("alterford:chain-updated"));
}

function getErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const maybe = error as { code?: unknown; cause?: unknown };
  if (typeof maybe.code === "number") return maybe.code;
  return getErrorCode(maybe.cause);
}

function getBlockExplorerUrls(): string[] | undefined {
  if (!("blockExplorers" in targetChain)) return undefined;
  return targetChain.blockExplorers?.default?.url ? [targetChain.blockExplorers.default.url] : undefined;
}

function permitDataFromSignature(value: bigint, deadline: bigint, signature: Hex) {
  if (signature.length !== 132) throw new Error("La wallet devolvio una firma de permiso invalida.");
  const v = Number.parseInt(signature.slice(130, 132), 16);
  return {
    value,
    deadline,
    v: v < 27 ? v + 27 : v,
    r: `0x${signature.slice(2, 66)}` as Hex,
    s: `0x${signature.slice(66, 130)}` as Hex,
  };
}

function buildMarketMetadataURI(input: CreateMarketInput | undefined, isUnderworldMode: boolean): string {
  const params = new URLSearchParams({
    question: input?.question?.trim() || "Mercado creado por usuarios",
    category: input?.category?.trim() || "UserMarkets",
    mode: isUnderworldMode ? "Underworld" : "Vanilla",
    description: "Mercado creado por usuarios en Alterford.",
  });
  return `alterford://market?${params.toString()}`;
}

async function providerFromConnector(connector: { getProvider?: (() => Promise<unknown>) | undefined } | undefined) {
  if (!connector?.getProvider) return null;
  const provider = await connector.getProvider();
  return provider && typeof provider === "object" && "request" in provider
    ? provider as EthereumProvider
    : null;
}
