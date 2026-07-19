// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { CoreProtocol } from "../src/core/CoreProtocol.sol";
import { RewardDistributor } from "../src/rewards/RewardDistributor.sol";
import { ReferralEngine } from "../src/growth/ReferralEngine.sol";
import { CampaignManager } from "../src/growth/CampaignManager.sol";
import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { CreationBondContextResolver } from "../src/bonds/CreationBondContextResolver.sol";
import { MarketFactory } from "../src/factories/MarketFactory.sol";
import { BountyFactory } from "../src/factories/BountyFactory.sol";
import { AlterfordTypes } from "../src/libraries/AlterfordTypes.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";

interface Vm {
    function warp(uint256 timestamp) external;
}

contract MarketUser {
    function approveToken(MockSettlementToken token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function createSmallMarket(
        MarketFactory factory,
        MockSettlementToken token,
        uint256 lockTime,
        uint256 resolutionTime
    ) external returns (uint256) {
        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";

        return factory.createMarket(
            address(token),
            keccak256("metadata"),
            "ipfs://metadata",
            outcomes,
            lockTime,
            resolutionTime,
            AlterfordTypes.NoWinnersPolicy.RefundAll,
            factory.bondContextResolver().CATEGORY_SPORTS()
        );
    }

    function placeBet(MarketFactory factory, uint256 marketId, uint8 outcome, uint256 amount)
        external
    {
        factory.placeBet(marketId, outcome, amount);
    }

    function claimReward(MarketFactory factory, uint256 marketId) external {
        factory.claimReward(marketId);
    }

    function claimRefund(MarketFactory factory, uint256 marketId) external {
        factory.claimRefund(marketId);
    }
}

contract AlterfordCoreTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testRewardDistributorUsesDynamicMarketFeeSplit() public {
        RewardDistributor rewards = new RewardDistributor(address(this));

        (uint256 smallAdmin, uint256 smallCreator, uint256 smallTotal) =
            rewards.calculateMarketFees(50_000_000, 20_000_000);
        require(smallAdmin == 400_000, "small admin fee must be 2%");
        require(smallCreator == 200_000, "small creator fee must be 1%");
        require(smallTotal == 600_000, "small total fee must be 3%");

        (uint256 standardAdmin, uint256 standardCreator, uint256 standardTotal) =
            rewards.calculateMarketFees(1_000_000_000, 400_000_000);
        require(standardAdmin == 8_000_000, "standard admin fee must be 2%");
        require(standardCreator == 6_000_000, "standard creator fee must be 1.5%");
        require(standardTotal == 14_000_000, "standard total fee must be 3.5%");

        (uint256 largeAdmin, uint256 largeCreator, uint256 largeTotal) =
            rewards.calculateMarketFees(5_000_000_000, 2_000_000_000);
        require(largeAdmin == 35_000_000, "large admin fee must be 1.75%");
        require(largeCreator == 15_000_000, "large creator fee must be 0.75%");
        require(largeTotal == 50_000_000, "large total fee must be 2.5%");

        (uint256 whaleAdmin, uint256 whaleCreator, uint256 whaleTotal) =
            rewards.calculateMarketFees(50_000_000_000, 20_000_000_000);
        require(whaleAdmin == 300_000_000, "whale admin fee must be 1.5%");
        require(whaleCreator == 100_000_000, "whale creator fee must be 0.5%");
        require(whaleTotal == 400_000_000, "whale total fee must be 2%");
    }

    function testWinnerPayoutUsesLosingPoolAfterFees() public {
        RewardDistributor rewards = new RewardDistributor(address(this));

        uint256 payout = rewards.calculateWinnerPayout({
            userWinningStake: 250_000, winningPool: 1_000_000, losingPool: 3_000_000
        });

        require(payout == 977_500, "winner payout mismatch");
    }

    function testRewardDistributorUsesDynamicChallengeFees() public {
        RewardDistributor rewards = new RewardDistributor(address(this));

        (uint256 fee100, uint256 creator100, uint256 total100) =
            rewards.calculateChallengeFees(100_000_000);
        require(fee100 == 10_000_000, "100 challenge fee must be 10%");
        require(creator100 == 0, "challenge creator fee must be zero");
        require(total100 == 10_000_000, "100 challenge total fee");

        (uint256 fee1k,, uint256 total1k) = rewards.calculateChallengeFees(1_000_000_000);
        require(fee1k == 80_000_000, "1k challenge fee must be 8%");
        require(total1k == 80_000_000, "1k challenge total fee");

        (uint256 fee10k,, uint256 total10k) = rewards.calculateChallengeFees(10_000_000_000);
        require(fee10k == 600_000_000, "10k challenge fee must be 6%");
        require(total10k == 600_000_000, "10k challenge total fee");

        (uint256 feeWhale,, uint256 totalWhale) = rewards.calculateChallengeFees(20_000_000_000);
        require(feeWhale == 800_000_000, "whale challenge fee must be 4%");
        require(totalWhale == 800_000_000, "whale challenge total fee");
    }

    function testCoreRejectsFeesAboveConstitutionalMaximum() public {
        CoreProtocol core = new CoreProtocol(address(this));

        try core.setFees(300, 250) {
            revert("fee update should fail");
        } catch { }
    }

    function testReferralRejectsSelfReferral() public {
        ReferralEngine referrals = new ReferralEngine(address(this));
        bytes32 codeHash = keccak256("ALTERFORD");

        referrals.createReferralCode(codeHash);

        try referrals.linkReferral(codeHash) {
            revert("self referral should fail");
        } catch { }
    }

    function testCampaignCannotOverpayEscrowedBudget() public {
        CampaignManager campaigns = new CampaignManager(address(this));
        uint256 campaignId = campaigns.createCampaign({
            budgetToken: address(0xBEEF), startTime: 1, endTime: 2, rulesHash: keccak256("rules")
        });

        campaigns.setRole(campaigns.MODULE_ROLE(), address(this), true);
        campaigns.recordFunding(campaignId, 100);
        campaigns.activate(campaignId);

        try campaigns.markRewardClaimed(campaignId, address(0xA11CE), 101) {
            revert("campaign overpayment should fail");
        } catch { }
    }

    function testBondPolicyCalculatesLowMediumAndHighBonds() public {
        CreationBondPolicy policy = new CreationBondPolicy(address(this));

        uint256 low = policy.calculateBond(
            CreationBondPolicy.BondContext({
                entityType: AlterfordTypes.EntityType.Market,
                mode: AlterfordTypes.Mode.Vanilla,
                creatorTier: AlterfordTypes.CreatorTier.Basic,
                categoryRisk: AlterfordTypes.RiskLevel.Low,
                reputation: AlterfordTypes.ReputationBand.New,
                expectedVolume: 20_000_000,
                disputeCount: 0,
                fraudCount: 0
            })
        );
        uint256 standard = policy.calculateBond(
            CreationBondPolicy.BondContext({
                entityType: AlterfordTypes.EntityType.Market,
                mode: AlterfordTypes.Mode.Vanilla,
                creatorTier: AlterfordTypes.CreatorTier.Basic,
                categoryRisk: AlterfordTypes.RiskLevel.Medium,
                reputation: AlterfordTypes.ReputationBand.New,
                expectedVolume: 200_000_000,
                disputeCount: 0,
                fraudCount: 0
            })
        );
        uint256 high = policy.calculateBond(
            CreationBondPolicy.BondContext({
                entityType: AlterfordTypes.EntityType.Market,
                mode: AlterfordTypes.Mode.Underworld,
                creatorTier: AlterfordTypes.CreatorTier.Basic,
                categoryRisk: AlterfordTypes.RiskLevel.High,
                reputation: AlterfordTypes.ReputationBand.New,
                expectedVolume: 500_000_000,
                disputeCount: 1,
                fraudCount: 0
            })
        );

        require(low == 500_000, "low-risk small Vanilla bond");
        require(standard == 3_000_000, "standard Vanilla bond");
        require(high == 10_000_000, "high-risk Underworld bond");
    }

    function testFuzzRewardDistributorFeeSplitNeverExceedsConstitutionalTotal(uint256 pool) public {
        pool = pool % 1_000_000_000_000_000;
        RewardDistributor rewards = new RewardDistributor(address(this));

        (uint256 adminFee, uint256 creatorFee, uint256 totalFee) =
            rewards.calculateMarketFees(pool, pool / 2);

        require(totalFee == adminFee + creatorFee, "total fee sum");
        require(totalFee <= ((pool / 2) * 350) / 10_000, "max market fee");
    }

    function testFuzzCreationBondPolicyAlwaysClampsToConfiguredBounds(
        uint8 mode,
        uint8 tier,
        uint8 risk,
        uint8 reputation,
        uint128 expectedVolume,
        uint8 disputeCount,
        uint8 fraudCount
    ) public {
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        uint256 bond = policy.calculateBond(
            CreationBondPolicy.BondContext({
                entityType: AlterfordTypes.EntityType.Market,
                mode: AlterfordTypes.Mode(uint8(mode % 2)),
                creatorTier: AlterfordTypes.CreatorTier(uint8(tier % 4)),
                categoryRisk: AlterfordTypes.RiskLevel(uint8(risk % 4)),
                reputation: AlterfordTypes.ReputationBand(uint8(reputation % 3)),
                expectedVolume: uint256(expectedVolume),
                disputeCount: disputeCount,
                fraudCount: fraudCount
            })
        );

        require(bond >= 500_000, "bond min");
        require(bond <= 10_000_000, "bond max");
    }

    function testInvariantConstitutionalFeeSplitConstants() public pure {
        require(AlterfordTypes.ADMIN_FEE_BPS == 200, "admin split changed");
        require(AlterfordTypes.CREATOR_FEE_BPS == 150, "creator split changed");
        require(AlterfordTypes.TOTAL_FEE_BPS == 350, "total split changed");
    }

    function testMarketFactoryLocksReleasesAndSlashesDynamicBond() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        MarketFactory factory = new MarketFactory(address(this), address(policy), address(resolver));
        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";
        token.mint(address(this), 1_000_000);
        token.approve(address(factory), 1_000_000);

        uint256 marketId = factory.createMarket(
            address(token),
            keccak256("metadata"),
            "ipfs://metadata",
            outcomes,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            AlterfordTypes.NoWinnersPolicy.RefundAll,
            resolver.CATEGORY_SPORTS()
        );

        require(factory.bondByMarket(marketId) == 500_000, "bond locked");
        factory.releaseBond(marketId);
        require(token.balanceOf(address(this)) == 1_000_000, "bond refunded");

        token.approve(address(factory), 1_000_000);
        uint256 fraudMarketId = factory.createMarket(
            address(token),
            keccak256("metadata2"),
            "ipfs://metadata2",
            outcomes,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            AlterfordTypes.NoWinnersPolicy.RefundAll,
            resolver.CATEGORY_SPORTS()
        );
        factory.confirmFraud(fraudMarketId, keccak256("fraud"));
        require(factory.bondByMarket(fraudMarketId) == 0, "bond slashed");
    }

    function testBountyFactoryRequiresDynamicBondAllowance() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        BountyFactory factory = new BountyFactory(address(this), address(policy), address(resolver));
        token.mint(address(this), 1_000_000);

        try factory.createBounty(
            address(token),
            1_000_000,
            block.timestamp + 1 days,
            keccak256("rules"),
            "ipfs://rules",
            resolver.CATEGORY_VANILLA_BOUNTY()
        ) {
            revert("bond transfer should fail without approval");
        } catch { }
    }

    function testMarketEndToEndApproveBetResolveClaimAndExactFees() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        MarketFactory factory = new MarketFactory(address(this), address(policy), address(resolver));
        MarketUser creator = new MarketUser();
        MarketUser alice = new MarketUser();
        MarketUser bob = new MarketUser();

        token.mint(address(creator), 500_000);
        token.mint(address(alice), 1_000_000);
        token.mint(address(bob), 3_000_000);
        creator.approveToken(token, address(factory), 500_000);
        alice.approveToken(token, address(factory), 1_000_000);
        bob.approveToken(token, address(factory), 3_000_000);

        uint256 marketId = creator.createSmallMarket(
            factory, token, block.timestamp + 1 days, block.timestamp + 2 days
        );

        alice.placeBet(factory, marketId, 0, 1_000_000);
        bob.placeBet(factory, marketId, 1, 3_000_000);

        vm.warp(block.timestamp + 3 days);
        factory.resolveMarket(marketId, 0);

        require(factory.adminFeeByMarket(marketId) == 60_000, "admin fee exact");
        require(factory.creatorFeeByMarket(marketId) == 30_000, "creator fee exact");
        require(token.balanceOf(address(this)) == 60_000, "admin paid");
        require(token.balanceOf(address(creator)) == 30_000, "creator paid");

        alice.claimReward(factory, marketId);
        require(token.balanceOf(address(alice)) == 3_910_000, "winner payout exact");

        try alice.claimReward(factory, marketId) {
            revert("double claim should fail");
        } catch { }
    }

    function testMarketRefundsWhenResolvedOutcomeHasNoWinners() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        MarketFactory factory = new MarketFactory(address(this), address(policy), address(resolver));
        MarketUser creator = new MarketUser();
        MarketUser alice = new MarketUser();

        token.mint(address(creator), 500_000);
        token.mint(address(alice), 1_000_000);
        creator.approveToken(token, address(factory), 500_000);
        alice.approveToken(token, address(factory), 1_000_000);

        uint256 marketId = creator.createSmallMarket(
            factory, token, block.timestamp + 1 days, block.timestamp + 2 days
        );
        alice.placeBet(factory, marketId, 1, 1_000_000);

        vm.warp(block.timestamp + 3 days);
        factory.resolveMarket(marketId, 0);

        try alice.claimReward(factory, marketId) {
            revert("no winners reward should fail");
        } catch { }

        alice.claimRefund(factory, marketId);
        require(token.balanceOf(address(alice)) == 1_000_000, "refund paid");

        try alice.claimRefund(factory, marketId) {
            revert("double refund should fail");
        } catch { }
    }

    function testMarketRejectsInsufficientAllowanceInvalidAmountAndLockedBet() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        MarketFactory factory = new MarketFactory(address(this), address(policy), address(resolver));
        MarketUser creator = new MarketUser();
        MarketUser alice = new MarketUser();

        token.mint(address(creator), 500_000);
        token.mint(address(alice), 1_000_000);
        creator.approveToken(token, address(factory), 500_000);

        uint256 marketId = creator.createSmallMarket(
            factory, token, block.timestamp + 1 days, block.timestamp + 2 days
        );

        try alice.placeBet(factory, marketId, 0, 1_000_000) {
            revert("bet without allowance should fail");
        } catch { }

        alice.approveToken(token, address(factory), 1_000_000);

        try alice.placeBet(factory, marketId, 0, 0) {
            revert("zero bet should fail");
        } catch { }

        vm.warp(block.timestamp + 1 days);
        try alice.placeBet(factory, marketId, 0, 1_000_000) {
            revert("locked market bet should fail");
        } catch { }
    }
}
