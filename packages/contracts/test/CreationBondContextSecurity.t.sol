// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { CreationBondContextResolver } from "../src/bonds/CreationBondContextResolver.sol";
import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { MarketFactory } from "../src/factories/MarketFactory.sol";
import { BountyFactory } from "../src/factories/BountyFactory.sol";
import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { AlterfordTypes } from "../src/libraries/AlterfordTypes.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";

interface VmBondContext {
    function prank(address caller) external;
    function expectRevert(bytes4 selector) external;
}

contract CreationBondContextSecurityTest {
    VmBondContext private constant VM =
        VmBondContext(address(uint160(uint256(keccak256("hevm cheat code")))));

    CreationBondPolicy private policy;
    CreationBondContextResolver private resolver;
    MockSettlementToken private token;

    function setUp() public {
        policy = new CreationBondPolicy(address(this));
        resolver = new CreationBondContextResolver(address(this));
        token = new MockSettlementToken();
    }

    function testUnknownCreatorCannotSelfAssignPremiumOrTrustedDiscount() public view {
        CreationBondPolicy.BondContext memory context = resolver.resolve(
            address(0xA11CE), AlterfordTypes.EntityType.Market, resolver.CATEGORY_TECHNOLOGY(), 0
        );

        require(context.creatorTier == AlterfordTypes.CreatorTier.Basic, "default tier");
        require(context.reputation == AlterfordTypes.ReputationBand.New, "default reputation");
        require(context.disputeCount == 0, "default disputes");
        require(context.fraudCount == 0, "default fraud");
        require(policy.calculateBond(context) == 3_000_000, "unearned discount applied");

        (uint256 previewAmount, uint16 reasonFlags) = resolver.previewBond(
            address(policy),
            address(0xA11CE),
            AlterfordTypes.EntityType.Market,
            resolver.CATEGORY_TECHNOLOGY(),
            0
        );
        require(previewAmount == 3_000_000, "resolver preview amount mismatch");
        require(reasonFlags == 0, "resolver preview flags mismatch");
    }

    function testOnlyAuthorizedModuleCanAttestCreatorProfile() public {
        CreationBondContextResolver.CreatorProfile memory profile =
            CreationBondContextResolver.CreatorProfile({
                creatorTier: AlterfordTypes.CreatorTier.Premium,
                reputation: AlterfordTypes.ReputationBand.Trusted,
                disputeCount: 0,
                fraudCount: 0
            });

        VM.prank(address(0xBAD));
        VM.expectRevert(bytes4(keccak256("Unauthorized()")));
        resolver.setCreatorProfile(address(0xA11CE), profile);

        resolver.setCreatorProfile(address(0xA11CE), profile);
        CreationBondPolicy.BondContext memory context = resolver.resolve(
            address(0xA11CE), AlterfordTypes.EntityType.Market, resolver.CATEGORY_TECHNOLOGY(), 0
        );
        require(policy.calculateBond(context) == 1_800_000, "premium profile not applied");
    }

    function testUnderworldCategoryCannotBeDowngradedByFactoryCalldata() public {
        MarketFactory factory = new MarketFactory(address(this), address(policy), address(resolver));
        token.mint(address(this), 10_000_000);
        token.approve(address(factory), 10_000_000);
        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";

        uint256 marketId = factory.createMarket(
            address(token),
            keccak256("underworld-market"),
            "ipfs://underworld-market",
            outcomes,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            AlterfordTypes.NoWinnersPolicy.RefundAll,
            resolver.CATEGORY_STRANGE_EVENTS()
        );

        require(factory.bondByMarket(marketId) == 10_000_000, "risk downgrade accepted");
        (,,,,,,,,, bytes32 categoryId, AlterfordTypes.Mode mode, AlterfordTypes.RiskLevel risk) =
            factory.markets(marketId);
        require(categoryId == resolver.CATEGORY_STRANGE_EVENTS(), "category not persisted");
        require(mode == AlterfordTypes.Mode.Underworld, "mode not authoritative");
        require(risk == AlterfordTypes.RiskLevel.High, "risk not authoritative");
    }

    function testBountyAndChallengeUseEscrowAsExpectedVolume() public {
        BountyFactory bounty = new BountyFactory(address(this), address(policy), address(resolver));
        ChallengeFactory challenge =
            new ChallengeFactory(address(this), address(policy), address(resolver), address(0xF0));
        token.mint(address(this), 2_100_000_000);
        token.approve(address(bounty), type(uint256).max);
        token.approve(address(challenge), type(uint256).max);

        uint256 bountyId = bounty.createBounty(
            address(token),
            1_000_000_000,
            block.timestamp + 1 days,
            keccak256("bounty"),
            "ipfs://bounty",
            resolver.CATEGORY_VANILLA_BOUNTY()
        );
        uint256 challengeId = challenge.createChallenge(
            address(token),
            1_000_000_000,
            keccak256("challenge"),
            "ipfs://challenge",
            block.timestamp + 2 days,
            resolver.CATEGORY_UNDERWORLD_CHALLENGE()
        );

        require(bounty.bondByBounty(bountyId) == 7_000_000, "bounty escrow volume ignored");
        require(
            challenge.bondByChallenge(challengeId) == 10_000_000, "challenge risk/volume ignored"
        );
    }

    function testUnknownOrWrongEntityCategoryReverts() public {
        VM.expectRevert(bytes4(keccak256("InvalidBondPolicy()")));
        resolver.resolve(address(this), AlterfordTypes.EntityType.Market, keccak256("UNKNOWN"), 0);

        bytes32 challengeCategory = resolver.CATEGORY_UNDERWORLD_CHALLENGE();
        VM.expectRevert(bytes4(keccak256("InvalidBondPolicy()")));
        resolver.resolve(address(this), AlterfordTypes.EntityType.Market, challengeCategory, 0);
    }
}
