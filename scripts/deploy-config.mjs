const BASE_SEPOLIA_CHAIN_ID = 84532;

const FOUNDRY_DEPLOYED_CONTRACTS = [
  ["settlementToken", "MockSettlementToken"],
  ["creationBondPolicy", "CreationBondPolicy"],
  ["bondContextResolver", "CreationBondContextResolver"],
  ["alterfordForwarder", "AlterfordForwarder"],
  ["marketFactory", "MarketFactory"],
  ["bountyFactory", "BountyFactory"],
  ["challengeFactory", "ChallengeFactory"],
  ["bountyRecoveryVault", "BountyRecoveryVault"],
];

export function contractsMissingFromReuse(reusedContracts = {}) {
  return FOUNDRY_DEPLOYED_CONTRACTS.filter(([key]) => !reusedContracts[key]);
}

export function indexFoundryContractCreations(transactions = []) {
  const byName = new Map();
  for (const transaction of transactions) {
    if (
      transaction.transactionType === "CREATE"
      && transaction.contractName
      && transaction.contractAddress
      && !byName.has(transaction.contractName)
    ) {
      byName.set(transaction.contractName, transaction);
    }
  }
  return byName;
}

export function deploymentRpcUrl(chainId, rpcUrl) {
  return chainId === BASE_SEPOLIA_CHAIN_ID ? "https://sepolia.base.org" : rpcUrl;
}

export function redactedRpcUrl(rpcUrl) {
  try {
    return new URL(rpcUrl).origin;
  } catch {
    return "[invalid RPC URL]";
  }
}
