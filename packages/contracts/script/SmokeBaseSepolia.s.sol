// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { MarketFactory } from "../src/factories/MarketFactory.sol";
import { AlterfordTypes } from "../src/libraries/AlterfordTypes.sol";

interface VmSmoke {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envAddress(string calldata name) external view returns (address value);
    function envUint(string calldata name) external view returns (uint256 value);
}

interface ISmokeSettlementToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

contract SmokeBaseSepoliaCreateBet {
    VmSmoke internal constant VM = VmSmoke(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant BET_AMOUNT = 1_000_000;

    function run() external {
        address actor = VM.envAddress("SMOKE_ACTOR");
        address token = VM.envAddress("SETTLEMENT_TOKEN_ADDRESS");
        address marketFactoryAddress = VM.envAddress("MARKET_FACTORY_ADDRESS");
        address bondPolicyAddress = VM.envAddress("CREATION_BOND_POLICY_ADDRESS");

        MarketFactory marketFactory = MarketFactory(marketFactoryAddress);
        ISmokeSettlementToken settlementToken = ISmokeSettlementToken(token);
        CreationBondPolicy bondPolicy = CreationBondPolicy(bondPolicyAddress);

        CreationBondPolicy.BondContext memory bondContext = CreationBondPolicy.BondContext({
            entityType: AlterfordTypes.EntityType.Market,
            mode: AlterfordTypes.Mode.Vanilla,
            creatorTier: AlterfordTypes.CreatorTier.Basic,
            categoryRisk: AlterfordTypes.RiskLevel.Low,
            reputation: AlterfordTypes.ReputationBand.New,
            expectedVolume: 20_000_000,
            disputeCount: 0,
            fraudCount: 0
        });
        (uint256 requiredBond,) = bondPolicy.previewBond(bondContext);
        uint256 allowanceBudget = requiredBond + (BET_AMOUNT * 2);
        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";

        VM.startBroadcast();
        settlementToken.mint(actor, allowanceBudget);
        settlementToken.approve(marketFactoryAddress, allowanceBudget);
        uint256 marketId = marketFactory.createMarket(
            token,
            keccak256(abi.encodePacked("alterford-base-sepolia-smoke", block.timestamp, actor)),
            "ipfs://alterford/base-sepolia-smoke",
            outcomes,
            block.timestamp + 90,
            block.timestamp + 120,
            AlterfordTypes.NoWinnersPolicy.RefundAll,
            bondContext
        );
        marketFactory.placeBet(marketId, 0, BET_AMOUNT);
        marketFactory.placeBet(marketId, 1, BET_AMOUNT);
        VM.stopBroadcast();
    }
}

contract SmokeBaseSepoliaResolveClaim {
    VmSmoke internal constant VM = VmSmoke(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external {
        address marketFactoryAddress = VM.envAddress("MARKET_FACTORY_ADDRESS");
        uint256 marketId = VM.envUint("SMOKE_MARKET_ID");
        MarketFactory marketFactory = MarketFactory(marketFactoryAddress);

        VM.startBroadcast();
        marketFactory.resolveMarket(marketId, 0);
        marketFactory.claimReward(marketId);
        VM.stopBroadcast();
    }
}

contract SmokeBaseSepoliaChallengeCreateCancel {
    VmSmoke internal constant VM = VmSmoke(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant REWARD_POOL = 5_000_000;

    function run() external {
        address actor = VM.envAddress("SMOKE_ACTOR");
        address token = VM.envAddress("SETTLEMENT_TOKEN_ADDRESS");
        address challengeFactoryAddress = VM.envAddress("CHALLENGE_FACTORY_ADDRESS");
        address bondPolicyAddress = VM.envAddress("CREATION_BOND_POLICY_ADDRESS");

        ChallengeFactory challengeFactory = ChallengeFactory(challengeFactoryAddress);
        ISmokeSettlementToken settlementToken = ISmokeSettlementToken(token);
        CreationBondPolicy bondPolicy = CreationBondPolicy(bondPolicyAddress);

        CreationBondPolicy.BondContext memory bondContext = CreationBondPolicy.BondContext({
            entityType: AlterfordTypes.EntityType.Challenge,
            mode: AlterfordTypes.Mode.Underworld,
            creatorTier: AlterfordTypes.CreatorTier.Basic,
            categoryRisk: AlterfordTypes.RiskLevel.High,
            reputation: AlterfordTypes.ReputationBand.New,
            expectedVolume: REWARD_POOL,
            disputeCount: 1,
            fraudCount: 0
        });
        (uint256 requiredBond,) = bondPolicy.previewBond(bondContext);
        uint256 allowanceBudget = requiredBond + REWARD_POOL;

        VM.startBroadcast();
        settlementToken.mint(actor, allowanceBudget);
        settlementToken.approve(challengeFactoryAddress, allowanceBudget);
        uint256 challengeId = challengeFactory.createChallenge(
            token,
            REWARD_POOL,
            keccak256(
                abi.encodePacked("alterford-base-sepolia-challenge-smoke", block.timestamp, actor)
            ),
            "ipfs://alterford/base-sepolia-challenge-smoke",
            block.timestamp + 1 days,
            bondContext
        );
        challengeFactory.cancelChallenge(challengeId, keccak256("smoke-cancel"));
        VM.stopBroadcast();
    }
}
