import {
  BASE_SEPOLIA_CHAIN_ID,
  DEFAULT_BOND_POLICY,
  buildForwardRequestTypedData,
  challengeFactoryAbi,
  erc20Abi,
  formatAddress,
  formatUsdt,
  marketFactoryAbi,
  toOnchainBondContext,
  type ContractAddresses,
  type CreationBondEstimate,
  type TxLifecycle,
} from "@alterford/sdk";
import { useMemo, useState } from "react";
import { encodeFunctionData, keccak256, toBytes, type Address, type Hex } from "viem";
import {
  useAccount,
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
import { AlterfordGatewayClient, waitForRelay } from "../web3/gatewayClient";

interface TxState {
  status: TxLifecycle;
  label: string;
  hash?: Hex;
  error?: string;
}

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

export function useWeb3Flow(
  bondEstimate: CreationBondEstimate,
  quickBetAmount: bigint,
  isUnderworldMode: boolean,
  challengeBondEstimate: CreationBondEstimate = bondEstimate,
  challengeRewardPool: bigint = 0n,
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
  const [marketId, setMarketId] = useState("1");
  const [selectedOutcome, setSelectedOutcome] = useState<0 | 1>(0);

  const addresses = useMemo(() => configuredAddresses(), []);
  const contractsReady = hasCoreAddresses(addresses);
  const desiredChainId = configuredChainId();
  const gateway = useMemo(
    () => import.meta.env.VITE_GATEWAY_URL
      ? new AlterfordGatewayClient(import.meta.env.VITE_GATEWAY_URL)
      : null,
    [],
  );
  const gaslessChallengesAvailable = Boolean(
    gateway && addresses.alterfordForwarder && addresses.challengeFactory,
  );
  const onTargetChain = chainId === desiredChainId;
  const requiredApproval = bondEstimate.amount + quickBetAmount;
  const challengeRequiredApproval = challengeBondEstimate.amount + challengeRewardPool;
  const createMarketCost = bondEstimate.amount;
  const betCost = quickBetAmount;
  const challengeCreateCost = challengeRequiredApproval;
  const challengeExecutorCost = challengeBondEstimate.amount;

  const balance = useReadContract({
    address: addresses.settlementToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account.address ? [account.address] : undefined,
    chainId: desiredChainId,
    query: { enabled: Boolean(account.address && addresses.settlementToken) },
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

  const currentBalance = (balance.data as bigint | undefined) ?? 0n;
  const currentAllowance = (allowance.data as bigint | undefined) ?? 0n;
  const currentChallengeAllowance = (challengeAllowance.data as bigint | undefined) ?? 0n;
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
  const spendPreview = {
    createMarket: bondEstimate.amount,
    placeBet: quickBetAmount,
    totalSetup: requiredApproval,
  };
  const hasInjectedProvider = Boolean((globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum);
  const preferredConnectorName = hasInjectedProvider ? "wallet" : "WalletConnect";
  const socialConnector = connectors.find((item) => item.id === "web3auth");
  const hasSocialLogin = Boolean(socialConnector);

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
      try {
        await switchWithInjectedFallback(targetChainId);
        setTx({ status: "confirmed", label: `Red activa: ${targetChain.name}` });
        return true;
      } catch (fallbackError) {
        setTx({
          status: "failed",
          label: `Cambiar a ${targetChain.name}`,
          error: readableSwitchError(fallbackError || error),
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
      await Promise.allSettled([balance.refetch(), allowance.refetch(), challengeAllowance.refetch()]);
    } catch (error) {
      setTx({ status: "failed", label, error: readableError(error) });
    }
  }

  async function runChallengeTx(
    label: string,
    data: Hex,
    directAction: (contracts: ContractAddresses) => Promise<Hex>,
  ) {
    const forwarder = addresses.alterfordForwarder;
    const challengeFactory = addresses.challengeFactory;
    if (!gateway || !forwarder || !challengeFactory) {
      await runTx(label, directAction);
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
        data,
      });
      const request = prepared.request;
      if (
        request.from.toLowerCase() !== account.address.toLowerCase()
        || request.to.toLowerCase() !== challengeFactory.toLowerCase()
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
      await Promise.allSettled([balance.refetch(), allowance.refetch(), challengeAllowance.refetch()]);
    } catch (error) {
      setTx({ status: "failed", label, error: readableError(error) });
    }
  }

  function guardedTx(label: string, checks: Array<[boolean, string]>, send: () => void) {
    const failed = checks.find(([passed]) => !passed);
    if (failed) {
      setTx({ status: "failed", label, error: failed[1] });
      return;
    }
    send();
  }

  const approveSettlement = () =>
    runTx("Autorizar uso de aUSDT", (contracts) =>
      writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.marketFactory, requiredApproval],
      }),
    );

  const approveChallengeSettlement = () =>
    runTx("Autorizar retos Underworld", (contracts) => {
      if (!contracts.challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      return writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "approve",
        chainId: desiredChainId,
        args: [contracts.challengeFactory, challengeRequiredApproval],
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
        args: [contracts.challengeFactory, challengeExecutorCost],
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
        args: [contracts.challengeFactory, disputeBond as bigint],
      });
    });

  const mintTestTokens = () =>
    runTx("Agregar fondos de prueba", (contracts) =>
      writeContractAsync({
        address: contracts.settlementToken,
        abi: erc20Abi,
        functionName: "mint",
        chainId: desiredChainId,
        args: [account.address as Address, 100_000_000n],
      }),
    );

  const createMarket = (input?: CreateMarketInput) =>
    guardedTx(
      "Crear mercado",
      [
        [hasEnoughCreateBalance, `Necesitas ${formatUsdt(createMarketCost)} aUSDT para bloquear el bond del mercado.`],
        [!needsCreateApproval, "Primero autoriza aUSDT para crear el mercado."],
      ],
      () => runTx("Crear mercado", (contracts) => {
      const metadataURI = buildMarketMetadataURI(input, isUnderworldMode);
      return writeContractAsync({
        address: contracts.marketFactory,
        abi: marketFactoryAbi,
        functionName: "createMarket",
        chainId: desiredChainId,
        args: [
          contracts.settlementToken,
          keccak256(toBytes(`${input?.question || "alterford-market"}-${Date.now()}`)),
          metadataURI,
          ["YES", "NO"],
          BigInt(Math.floor(Date.now() / 1000) + Math.max(5, input?.closesInMinutes ?? 60) * 60),
          BigInt(Math.floor(Date.now() / 1000) + Math.max(10, input?.resolvesInMinutes ?? 120) * 60),
          0,
          toOnchainBondContext({
            entityType: "Market",
            mode: isUnderworldMode ? "Underworld" : "Vanilla",
            creatorTier: "Basic",
            categoryRisk: isUnderworldMode ? "High" : "Low",
            reputation: "New",
            expectedVolumeUsdt: isUnderworldMode ? 500_000_000n : 20_000_000n,
            disputeCount: isUnderworldMode ? 1 : 0,
            fraudCount: 0,
            policy: DEFAULT_BOND_POLICY,
          }),
        ],
      });
      }),
    );

  const createChallenge = (input: CreateChallengeInput) =>
    guardedTx(
      "Crear reto Underworld",
      [
        [hasEnoughChallengeBalance, `Necesitas ${formatUsdt(challengeCreateCost)} aUSDT para recompensa + bond.`],
        [!needsChallengeApproval, "Primero autoriza aUSDT para retos Underworld."],
      ],
      () => {
      const challengeFactory = addresses.challengeFactory;
      if (!challengeFactory || !addresses.settlementToken) throw new Error("ChallengeFactory is not configured for this network.");
      const metadataURI = buildChallengeMetadataURI(input);
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
        toOnchainBondContext({
          entityType: "Challenge",
          mode: "Underworld",
          creatorTier: "Basic",
          categoryRisk: input.riskLevel,
          reputation: "New",
          expectedVolumeUsdt: input.stakeUsdt,
          disputeCount: input.riskLevel === "Critical" ? 2 : 1,
          fraudCount: 0,
          policy: DEFAULT_BOND_POLICY,
        }),
      ] as const;
      return runChallengeTx("Crear reto Underworld", encodeFunctionData({
        abi: challengeFactoryAbi,
        functionName: "createChallenge",
        args,
      }), () => writeContractAsync({
        address: challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "createChallenge",
        chainId: desiredChainId,
        args,
      }));
      },
    );

  const acceptChallenge = (input: ChallengeActionInput) =>
    guardedTx(
      "Aceptar reto",
      [
        [hasEnoughChallengeExecutorBalance, `Necesitas ${formatUsdt(challengeExecutorCost)} aUSDT para el bond de ejecutor.`],
        [!needsChallengeExecutorApproval, "Primero autoriza aUSDT para aceptar retos."],
      ],
      () => {
      const challengeFactory = addresses.challengeFactory;
      if (!challengeFactory) throw new Error("ChallengeFactory is not configured for this network.");
      const args = [BigInt(input.challengeId || "1"), input.liveStreamURI || ""] as const;
      return runChallengeTx("Aceptar reto", encodeFunctionData({
        abi: challengeFactoryAbi,
        functionName: "acceptChallenge",
        args,
      }), () => writeContractAsync({
        address: challengeFactory,
        abi: challengeFactoryAbi,
        functionName: "acceptChallenge",
        chainId: desiredChainId,
        args,
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
        [!needsBetApproval, "Primero autoriza aUSDT para apostar."],
      ],
      () => runTx("Confirmar prediccion", (contracts) =>
      writeContractAsync({
        address: contracts.marketFactory,
        abi: marketFactoryAbi,
        functionName: "placeBet",
        chainId: desiredChainId,
        args: [BigInt(marketId || "1"), selectedOutcome, quickBetAmount],
      }),
      ),
    );

  const resolveMarket = () =>
    runTx("Resolver mercado", (contracts) =>
      writeContractAsync({
        address: contracts.marketFactory,
        abi: marketFactoryAbi,
        functionName: "resolveMarket",
        chainId: desiredChainId,
        args: [BigInt(marketId || "1"), selectedOutcome],
      }),
    );

  const claimReward = () =>
    runTx("Cobrar ganancia", (contracts) =>
      writeContractAsync({
        address: contracts.marketFactory,
        abi: marketFactoryAbi,
        functionName: "claimReward",
        chainId: desiredChainId,
        args: [BigInt(marketId || "1")],
      }),
    );

  const claimRefund = () =>
    runTx("Recibir reembolso", (contracts) =>
      writeContractAsync({
        address: contracts.marketFactory,
        abi: marketFactoryAbi,
        functionName: "claimRefund",
        chainId: desiredChainId,
        args: [BigInt(marketId || "1")],
      }),
    );

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
    addresses,
    balance: currentBalance,
    allowance: currentAllowance,
    challengeAllowance: currentChallengeAllowance,
    requiredApproval,
    challengeRequiredApproval,
    needsApproval,
    needsChallengeApproval,
    hasEnoughBalance,
    hasEnoughChallengeBalance,
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
    disconnect,
    switchToTargetChain,
    approveSettlement,
    approveChallengeSettlement,
    approveChallengeExecutorBond,
    approveChallengeDispute,
    mintTestTokens,
    createMarket,
    createChallenge,
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
    accountLabel: formatAddress(account.address),
    balanceLabel: `${formatUsdt(currentBalance)} aUSDT`,
    allowanceLabel: `${formatUsdt(currentAllowance)} aUSDT`,
    challengeAllowanceLabel: `${formatUsdt(currentChallengeAllowance)} aUSDT`,
    challengeTotalCostLabel: `${formatUsdt(challengeRequiredApproval)} aUSDT`,
    createCostLabel: `${formatUsdt(bondEstimate.amount)} aUSDT bond`,
    betCostLabel: `${formatUsdt(quickBetAmount)} aUSDT`,
  };
}

function buildChallengeMetadataURI(input: CreateChallengeInput): string {
  const params = new URLSearchParams({
    title: input.title.trim() || "Reto Underworld",
    evidence: input.evidence.trim() || "Evidencia pendiente",
    live: input.liveStreamURI?.trim() || "",
    mode: "Underworld",
    description: "Reto creado por usuario en Alterford.",
  });
  return `alterford://challenge?${params.toString()}`;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split("\n")[0] || message;
  if (/user rejected|user denied|rejected/i.test(message)) {
    return "Operacion cancelada en la wallet.";
  }
  if (/insufficient funds/i.test(message)) {
    return "No tienes ETH suficiente en Base Sepolia para pagar gas.";
  }
  if (/allowance/i.test(message)) {
    return "Falta autorizar aUSDT antes de continuar.";
  }
  if (/switch chain|chain|network/i.test(message)) {
    return `La wallet no pudo cambiar a ${targetChain.name}. Abre MetaMask, selecciona Base Sepolia y vuelve a intentar.`;
  }
  return firstLine || "La transaccion fallo.";
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

function readableSwitchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected|user denied|rejected/i.test(message)) {
    return "Cancelaste el cambio de red en la wallet. Selecciona Base Sepolia para poder continuar.";
  }
  return `No pude cambiar automaticamente a ${targetChain.name}. Abre MetaMask, agrega Base Sepolia si hace falta y vuelve a intentar.`;
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

function buildMarketMetadataURI(input: CreateMarketInput | undefined, isUnderworldMode: boolean): string {
  const params = new URLSearchParams({
    question: input?.question?.trim() || "Mercado creado por usuarios",
    category: input?.category?.trim() || "UserMarkets",
    mode: isUnderworldMode ? "Underworld" : "Vanilla",
    description: "Mercado creado por usuarios en Alterford.",
  });
  return `alterford://market?${params.toString()}`;
}
