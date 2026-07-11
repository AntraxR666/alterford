export const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const marketFactoryAbi = [
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "settlementToken", type: "address" },
      { name: "metadataHash", type: "bytes32" },
      { name: "metadataURI", type: "string" },
      { name: "outcomes", type: "string[]" },
      { name: "lockTime", type: "uint256" },
      { name: "resolutionTime", type: "uint256" },
      { name: "noWinnersPolicy", type: "uint8" },
      {
        name: "bondContext",
        type: "tuple",
        components: [
          { name: "entityType", type: "uint8" },
          { name: "mode", type: "uint8" },
          { name: "creatorTier", type: "uint8" },
          { name: "categoryRisk", type: "uint8" },
          { name: "reputation", type: "uint8" },
          { name: "expectedVolume", type: "uint256" },
          { name: "disputeCount", type: "uint256" },
          { name: "fraudCount", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    type: "function",
    name: "placeBet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "outcome", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "winningOutcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimReward",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "totalStakeByUser",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "settlementToken", type: "address", indexed: true },
      { name: "metadataHash", type: "bytes32", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "outcome", type: "uint8", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MarketResolved",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "winningOutcome", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FeesAccrued",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "admin", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "adminFee", type: "uint256", indexed: false },
      { name: "creatorFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RewardClaimed",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RefundClaimed",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondCalculated",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "requiredBond", type: "uint256", indexed: false },
      { name: "reasonFlags", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondLocked",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondReleased",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondSlashed",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reasonHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

export const creationBondPolicyAbi = [
  {
    type: "function",
    name: "previewBond",
    stateMutability: "view",
    inputs: [
      {
        name: "context",
        type: "tuple",
        components: [
          { name: "entityType", type: "uint8" },
          { name: "mode", type: "uint8" },
          { name: "creatorTier", type: "uint8" },
          { name: "categoryRisk", type: "uint8" },
          { name: "reputation", type: "uint8" },
          { name: "expectedVolume", type: "uint256" },
          { name: "disputeCount", type: "uint256" },
          { name: "fraudCount", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "reasonFlags", type: "uint16" },
    ],
  },
] as const;

export const challengeFactoryAbi = [
  {
    type: "function",
    name: "createChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "settlementToken", type: "address" },
      { name: "rewardPool", type: "uint256" },
      { name: "rulesHash", type: "bytes32" },
      { name: "metadataURI", type: "string" },
      { name: "deadline", type: "uint256" },
      {
        name: "bondContext",
        type: "tuple",
        components: [
          { name: "entityType", type: "uint8" },
          { name: "mode", type: "uint8" },
          { name: "creatorTier", type: "uint8" },
          { name: "categoryRisk", type: "uint8" },
          { name: "reputation", type: "uint8" },
          { name: "expectedVolume", type: "uint256" },
          { name: "disputeCount", type: "uint256" },
          { name: "fraudCount", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "challengeId", type: "uint256" }],
  },
  {
    type: "function",
    name: "acceptChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "liveStreamURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateLiveStreamURI",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "liveStreamURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitEvidence",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "evidenceURI", type: "string" },
      { name: "liveStreamURI", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "executorSucceeded", type: "bool" },
      { name: "slashCreatorBond", type: "bool" },
      { name: "slashExecutorBond", type: "bool" },
      { name: "reasonHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "reasonHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "confirmFraud",
    stateMutability: "nonpayable",
    inputs: [
      { name: "challengeId", type: "uint256" },
      { name: "offender", type: "address" },
      { name: "reasonHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ChallengeCreated",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "rewardPool", type: "uint256", indexed: false },
      { name: "rulesHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeAccepted",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "executor", type: "address", indexed: true },
      { name: "executorBond", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeLiveStreamUpdated",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "actor", type: "address", indexed: true },
      { name: "liveStreamURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeEvidenceSubmitted",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "executor", type: "address", indexed: true },
      { name: "evidenceHash", type: "bytes32", indexed: false },
      { name: "evidenceURI", type: "string", indexed: false },
      { name: "liveStreamURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeResolved",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "executorSucceeded", type: "bool", indexed: false },
      { name: "rewardPayout", type: "uint256", indexed: false },
      { name: "adminFee", type: "uint256", indexed: false },
      { name: "creatorFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeCancelled",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "reasonHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeFraudConfirmed",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "offender", type: "address", indexed: true },
      { name: "reasonHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondCalculated",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "requiredBond", type: "uint256", indexed: false },
      { name: "reasonFlags", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondLocked",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
