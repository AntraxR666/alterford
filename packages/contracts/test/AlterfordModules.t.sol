// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { CreationBondContextResolver } from "../src/bonds/CreationBondContextResolver.sol";
import { AchievementRegistry } from "../src/growth/AchievementRegistry.sol";
import { AntiSybilEngine } from "../src/reputation/AntiSybilEngine.sol";
import { ComplianceGuard } from "../src/moderation/ComplianceGuard.sol";
import { CreatorMonetization } from "../src/monetization/CreatorMonetization.sol";
import { CreatorRegistry } from "../src/registry/CreatorRegistry.sol";
import { EvidenceVault } from "../src/oracle/EvidenceVault.sol";
import { ModerationCouncil } from "../src/moderation/ModerationCouncil.sol";
import { OracleRouter } from "../src/oracle/OracleRouter.sol";
import { QuestEngine } from "../src/growth/QuestEngine.sol";
import { ReputationEngine } from "../src/reputation/ReputationEngine.sol";
import { SocialGraph } from "../src/social/SocialGraph.sol";
import { SponsoredMarketRegistry } from "../src/monetization/SponsoredMarketRegistry.sol";
import { Treasury } from "../src/treasury/Treasury.sol";
import { AlterfordTypes } from "../src/libraries/AlterfordTypes.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";

interface Vm {
    function warp(uint256 timestamp) external;
}

contract QuestUser {
    function claim(QuestEngine quests, uint256 questId) external {
        quests.claimQuestReward(questId);
    }
}

contract ChallengeUser {
    function approveToken(MockSettlementToken token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function createChallenge(
        ChallengeFactory factory,
        MockSettlementToken token,
        uint256 rewardPool,
        uint256 deadline
    ) external returns (uint256) {
        return factory.createChallenge(
            address(token),
            rewardPool,
            keccak256("challenge-rules"),
            "ipfs://challenge",
            deadline,
            factory.bondContextResolver().CATEGORY_VANILLA_CHALLENGE()
        );
    }

    function accept(ChallengeFactory factory, uint256 challengeId, string calldata liveStreamURI)
        external
    {
        factory.acceptChallenge(challengeId, liveStreamURI);
    }

    function submitEvidence(
        ChallengeFactory factory,
        uint256 challengeId,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        string calldata liveStreamURI
    ) external {
        factory.submitEvidence(challengeId, evidenceHash, evidenceURI, liveStreamURI);
    }
}

contract SponsorshipUser {
    function sponsor(
        SponsoredMarketRegistry registry,
        uint256 marketId,
        string calldata disclosureURI
    ) external {
        registry.sponsorMarket(marketId, disclosureURI);
    }

    function end(SponsoredMarketRegistry registry, uint256 marketId) external {
        registry.endSponsorship(marketId);
    }
}

contract AlterfordModulesTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testChallengeFactoryLocksReleasesAndSlashesDynamicBond() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        ChallengeFactory factory =
            new ChallengeFactory(address(this), address(policy), address(resolver), address(0xF0));

        token.mint(address(this), 30_000_000);
        token.approve(address(factory), 30_000_000);

        uint256 challengeId = factory.createChallenge(
            address(token),
            10_000_000,
            keccak256("challenge-rules"),
            "ipfs://challenge",
            block.timestamp + 1 days,
            resolver.CATEGORY_VANILLA_CHALLENGE()
        );

        require(factory.bondByChallenge(challengeId) == 5_000_000, "challenge bond locked");
        require(token.balanceOf(address(factory)) == 15_000_000, "reward and bond escrowed");
        factory.releaseBond(challengeId);
        require(token.balanceOf(address(this)) == 20_000_000, "challenge bond refunded");

        token.approve(address(factory), 30_000_000);
        uint256 fraudChallengeId = factory.createChallenge(
            address(token),
            10_000_000,
            keccak256("challenge-rules-2"),
            "ipfs://challenge-2",
            block.timestamp + 1 days,
            resolver.CATEGORY_VANILLA_CHALLENGE()
        );
        factory.slashBond(fraudChallengeId, keccak256("fraud"));
        require(factory.bondByChallenge(fraudChallengeId) == 0, "challenge bond slashed");
    }

    function testChallengeEscrowAcceptEvidenceResolvePaysFeesAndBonds() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        ChallengeFactory factory =
            new ChallengeFactory(address(this), address(policy), address(resolver), address(0xF0));
        ChallengeUser creator = new ChallengeUser();
        ChallengeUser executor = new ChallengeUser();

        token.mint(address(creator), 110_000_000);
        token.mint(address(executor), 10_000_000);
        creator.approveToken(token, address(factory), 110_000_000);
        executor.approveToken(token, address(factory), 10_000_000);

        uint256 challengeId =
            creator.createChallenge(factory, token, 100_000_000, block.timestamp + 1 days);
        uint256 creatorBond = factory.bondByChallenge(challengeId);
        require(
            token.balanceOf(address(factory)) == 100_000_000 + creatorBond, "creator escrow locked"
        );

        executor.accept(factory, challengeId, "https://live.example/challenge");
        require(
            token.balanceOf(address(factory)) == 100_000_000 + (creatorBond * 2),
            "executor bond locked"
        );

        executor.submitEvidence(
            factory,
            challengeId,
            keccak256("video-proof"),
            "ipfs://evidence",
            "https://live.example/final"
        );

        factory.resolveChallenge(challengeId, true, false, false, keccak256("fulfilled"));

        require(token.balanceOf(address(this)) == 10_000_000, "admin fee paid");
        require(token.balanceOf(address(creator)) == 10_000_000, "creator bond returned");
        require(token.balanceOf(address(executor)) == 100_000_000, "executor payout and bond");
        require(token.balanceOf(address(factory)) == 0, "escrow drained exactly");

        try factory.resolveChallenge(challengeId, true, false, false, keccak256("again")) {
            revert("double resolve should fail");
        } catch { }
    }

    function testChallengeCancelRefundsRewardAndBonds() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        ChallengeFactory factory =
            new ChallengeFactory(address(this), address(policy), address(resolver), address(0xF0));
        ChallengeUser creator = new ChallengeUser();
        ChallengeUser executor = new ChallengeUser();

        token.mint(address(creator), 30_000_000);
        token.mint(address(executor), 10_000_000);
        creator.approveToken(token, address(factory), 30_000_000);
        executor.approveToken(token, address(factory), 10_000_000);

        uint256 challengeId =
            creator.createChallenge(factory, token, 20_000_000, block.timestamp + 1 days);
        executor.accept(factory, challengeId, "https://live.example/challenge");

        factory.cancelChallenge(challengeId, keccak256("moderation"));

        require(token.balanceOf(address(creator)) == 30_000_000, "creator fully refunded");
        require(token.balanceOf(address(executor)) == 10_000_000, "executor bond refunded");
        require(token.balanceOf(address(factory)) == 0, "escrow empty");
    }

    function testChallengeExecutorFailureRefundsRewardAndSlashesExecutorBond() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        ChallengeFactory factory =
            new ChallengeFactory(address(this), address(policy), address(resolver), address(0xF0));
        ChallengeUser creator = new ChallengeUser();
        ChallengeUser executor = new ChallengeUser();

        token.mint(address(creator), 30_000_000);
        token.mint(address(executor), 10_000_000);
        creator.approveToken(token, address(factory), 30_000_000);
        executor.approveToken(token, address(factory), 10_000_000);

        uint256 challengeId =
            creator.createChallenge(factory, token, 20_000_000, block.timestamp + 1 days);
        uint256 executorBond = factory.bondByChallenge(challengeId);
        executor.accept(factory, challengeId, "https://live.example/challenge");

        factory.resolveChallenge(challengeId, false, false, true, keccak256("not-fulfilled"));

        require(token.balanceOf(address(creator)) == 30_000_000, "creator reward and bond refunded");
        require(
            token.balanceOf(address(executor)) == 10_000_000 - executorBond, "executor bond slashed"
        );
        require(token.balanceOf(address(factory)) == executorBond, "slashed bond retained");
    }

    function testOracleRouterAssignsSubmitsAndChallengesResults() public {
        OracleRouter oracle = new OracleRouter(address(this));

        oracle.registerAdapter(AlterfordTypes.OracleType.SportsOracle, address(0xBEEF));
        oracle.assignPolicy(1, AlterfordTypes.OracleType.SportsOracle, 8000);

        try oracle.assignPolicy(1, AlterfordTypes.OracleType.ManualArbiter, 1) {
            revert("immutable oracle policy should reject reassignment");
        } catch { }

        try oracle.submitResult(1, 1, 7999, 10) {
            revert("low confidence oracle result should fail");
        } catch { }

        oracle.submitResult(1, 1, 9000, 10);
        (, uint16 confidence,, bool submitted, bool challenged) = oracle.resultByMarket(1);
        require(confidence == 9000, "oracle confidence persisted");
        require(submitted, "oracle result submitted");

        oracle.challengeResult(1, keccak256("bad-evidence"));
        (,,,, challenged) = oracle.resultByMarket(1);
        require(challenged, "oracle result challenged");
    }

    function testModerationCouncilTracksDecisionsByEntity() public {
        ModerationCouncil moderation = new ModerationCouncil(address(this));
        bytes32 entityType = "Market";

        uint256 caseId = moderation.flagContent(entityType, 1, keccak256("spam"));
        (,, AlterfordTypes.ModerationStatus flagged,,) = moderation.casesById(caseId);
        require(flagged == AlterfordTypes.ModerationStatus.Flagged, "content flagged");

        moderation.submitDecision(
            caseId, AlterfordTypes.ModerationStatus.ConfirmedViolation, keccak256("fraud")
        );
        (,, AlterfordTypes.ModerationStatus decided,,) = moderation.casesById(caseId);
        require(
            decided == AlterfordTypes.ModerationStatus.ConfirmedViolation, "violation confirmed"
        );
    }

    function testReputationEngineUpdatesScoresAndPublishesSnapshots() public {
        ReputationEngine reputation = new ReputationEngine(address(this));
        ReputationEngine.Reputation memory next = ReputationEngine.Reputation({
            creatorQualityScore: 9000,
            userTrustScore: 8500,
            resolverReliabilityScore: 8000,
            sybilRiskScore: 1000,
            marketIntegrityScore: 9200,
            lastUpdated: 0
        });

        reputation.updateScores(address(0xA11CE), next, keccak256("quality"));
        (
            uint16 creatorQualityScore,
            uint16 userTrustScore,
            uint16 resolverReliabilityScore,
            uint16 sybilRiskScore,
            uint16 marketIntegrityScore,
            uint64 lastUpdated
        ) = reputation.reputationOf(address(0xA11CE));

        require(creatorQualityScore == 9000, "creator score");
        require(userTrustScore == 8500, "user score");
        require(resolverReliabilityScore == 8000, "resolver score");
        require(sybilRiskScore == 1000, "sybil score");
        require(marketIntegrityScore == 9200, "integrity score");
        require(lastUpdated > 0, "timestamp updated");

        reputation.publishSnapshot(1, keccak256("snapshot-root"), "2026-W26");
        require(reputation.snapshotRoot(1) == keccak256("snapshot-root"), "snapshot root");

        next.creatorQualityScore = reputation.MAX_SCORE() + 1;
        try reputation.updateScores(address(0xA11CE), next, keccak256("invalid")) {
            revert("invalid reputation score should fail");
        } catch { }
    }

    function testTreasuryEscrowFeesReleaseAndSlashAreAccountingBounded() public {
        MockSettlementToken token = new MockSettlementToken();
        Treasury treasury = new Treasury(address(this));
        bytes32 entityId = keccak256("market-1");

        token.mint(address(this), 1_000_000);
        token.approve(address(treasury), 1_000_000);
        treasury.depositEscrow(entityId, address(token), address(this), 1_000_000);

        treasury.accrueFees(entityId, address(0xC0FFEE), 20_000, 15_000);
        require(treasury.adminFeeBalance(address(this)) == 20_000, "admin fee balance");
        require(treasury.creatorFeeBalance(address(0xC0FFEE)) == 15_000, "creator fee balance");

        treasury.releaseEscrow(entityId, address(token), address(0xA11CE), 100_000);
        require(token.balanceOf(address(0xA11CE)) == 100_000, "escrow released");

        treasury.slashBond(entityId, 50_000, keccak256("fraud"));
        (uint256 escrowed,,,, uint256 slashed) = treasury.accounts(entityId);
        require(escrowed == 815_000, "remaining escrow");
        require(slashed == 50_000, "slashed accounting");

        try treasury.releaseEscrow(entityId, address(token), address(0xA11CE), 900_000) {
            revert("over-release should fail");
        } catch { }
    }

    function testCreatorRegistryLifecycleAndFraudSuspension() public {
        CreatorRegistry registry = new CreatorRegistry(address(this));

        registry.registerCreator("ipfs://creator");
        (AlterfordTypes.CreatorStatus status,,,,,,,, string memory metadataURI) =
            registry.creators(address(this));
        require(status == AlterfordTypes.CreatorStatus.Basic, "creator registered");
        require(keccak256(bytes(metadataURI)) == keccak256(bytes("ipfs://creator")), "metadata");

        registry.recordMarketCreated(address(this));
        registry.setCreatorStatus(address(this), AlterfordTypes.CreatorStatus.Premium);
        registry.recordFraud(address(this), keccak256("fraud"));
        uint256 createdMarkets;
        uint256 fraudCount;
        (status, createdMarkets,, fraudCount,,,,,) = registry.creators(address(this));
        require(createdMarkets == 1, "market count");
        require(fraudCount == 1, "fraud count");
        require(status == AlterfordTypes.CreatorStatus.Suspended, "creator suspended");
    }

    function testEvidenceVaultStoresFlagsAndLinksEvidence() public {
        EvidenceVault evidence = new EvidenceVault(address(this));

        uint256 evidenceId =
            evidence.submitEvidence("Market", 1, keccak256("evidence"), "ipfs://evidence");
        (,, bytes32 evidenceHash,, address submitter,, bool flagged) =
            evidence.evidenceById(evidenceId);
        require(evidenceHash == keccak256("evidence"), "evidence hash");
        require(submitter == address(this), "evidence submitter");
        require(!flagged, "evidence initially clean");

        evidence.flagEvidence(evidenceId, keccak256("bad-uri"));
        (,,,,,, flagged) = evidence.evidenceById(evidenceId);
        require(flagged, "evidence flagged");

        uint256 childEvidenceId =
            evidence.submitEvidence("Market", 1, keccak256("child-evidence"), "ipfs://child");
        evidence.linkEvidence(evidenceId, childEvidenceId);
    }

    function testQuestEngineCompletesAndClaimsOnce() public {
        QuestEngine quests = new QuestEngine(address(this));
        QuestUser user = new QuestUser();

        uint256 questId = quests.createQuest(keccak256("criteria"), 1, 2);
        quests.completeQuest(questId, address(user));
        user.claim(quests, questId);

        require(
            quests.userQuestState(questId, address(user)) == QuestEngine.QuestState.Claimed,
            "quest claimed"
        );

        try user.claim(quests, questId) {
            revert("double quest claim should fail");
        } catch { }
    }

    function testSocialGraphTracksFollowsAndWatches() public {
        SocialGraph social = new SocialGraph(address(this));

        social.follow(address(0xA11CE));
        social.watchMarket(1);
        social.watchCategory(keccak256("sports"));

        require(social.follows(address(this), address(0xA11CE)), "follow stored");
        require(social.watchesMarket(address(this), 1), "market watch stored");
        require(social.watchesCategory(address(this), keccak256("sports")), "category watch");

        social.unfollow(address(0xA11CE));
        require(!social.follows(address(this), address(0xA11CE)), "unfollow stored");
    }

    function testAchievementRegistryIssuesAndRevokesActiveAchievements() public {
        AchievementRegistry achievements = new AchievementRegistry(address(this));
        bytes32 achievementId = keccak256("first-win");

        try achievements.issue(address(0xA11CE), achievementId, 1) {
            revert("inactive achievement should fail");
        } catch { }

        achievements.setAchievement(achievementId, "ipfs://achievement", true);
        achievements.issue(address(0xA11CE), achievementId, 1);
        require(achievements.issued(address(0xA11CE), achievementId), "achievement issued");

        achievements.revoke(address(0xA11CE), achievementId, keccak256("bad-award"));
        require(!achievements.issued(address(0xA11CE), achievementId), "achievement revoked");
    }

    function testComplianceGuardStoresRestrictionsAndBlockedParticipation() public {
        ComplianceGuard compliance = new ComplianceGuard(address(this));
        bytes32 regionHash = keccak256("restricted-region");
        bytes32 categoryHash = keccak256("restricted-category");

        compliance.setRegionRestriction(regionHash, true);
        compliance.setCategoryRestriction(categoryHash, true);
        compliance.logBlockedParticipation(address(0xA11CE), keccak256("restricted"));

        require(compliance.restrictedRegions(regionHash), "region restricted");
        require(compliance.restrictedCategories(categoryHash), "category restricted");
    }

    function testCreatorMonetizationRecordsTipsAndSubscriptions() public {
        CreatorMonetization monetization = new CreatorMonetization(address(this));

        monetization.recordTip(address(0xA11CE), address(0xC0FFEE), 100);
        require(monetization.tipsReceived(address(0xC0FFEE)) == 100, "tip recorded");

        monetization.recordSubscription(
            address(0xA11CE), address(0xC0FFEE), block.timestamp + 30 days
        );
        require(
            monetization.premiumUntil(address(0xA11CE)) == block.timestamp + 30 days,
            "subscription recorded"
        );

        try monetization.recordTip(address(0xA11CE), address(0), 100) {
            revert("zero creator tip should fail");
        } catch { }

        try monetization.recordSubscription(address(0xA11CE), address(0xC0FFEE), block.timestamp) {
            revert("expired subscription should fail");
        } catch { }
    }

    function testSponsoredMarketRegistryTracksSponsorAndAllowsOwnerOrGovernorToEnd() public {
        SponsoredMarketRegistry sponsorships = new SponsoredMarketRegistry(address(this));
        SponsorshipUser sponsor = new SponsorshipUser();
        SponsorshipUser stranger = new SponsorshipUser();

        sponsor.sponsor(sponsorships, 1, "ipfs://disclosure");
        (address sponsorAddress, string memory disclosureURI, bool active) =
            sponsorships.sponsorshipByMarket(1);
        require(sponsorAddress == address(sponsor), "sponsor stored");
        require(keccak256(bytes(disclosureURI)) == keccak256(bytes("ipfs://disclosure")), "uri");
        require(active, "sponsorship active");

        try stranger.end(sponsorships, 1) {
            revert("stranger should not end sponsorship");
        } catch { }

        sponsor.end(sponsorships, 1);
        (,, active) = sponsorships.sponsorshipByMarket(1);
        require(!active, "sponsorship ended by sponsor");

        sponsor.sponsor(sponsorships, 2, "ipfs://disclosure-2");
        sponsorships.endSponsorship(2);
        (,, active) = sponsorships.sponsorshipByMarket(2);
        require(!active, "sponsorship ended by governor");
    }

    function testAntiSybilEngineTracksRiskBlocksAndEnhancedBond() public {
        AntiSybilEngine antiSybil = new AntiSybilEngine(address(this));

        antiSybil.setSybilRisk(address(0xA11CE), 8500, keccak256("cluster"));
        antiSybil.blockPromotionalReward(address(0xA11CE), keccak256("farm"));
        antiSybil.requireEnhancedBond(address(0xA11CE), 5_000_000, keccak256("risk"));

        require(antiSybil.sybilRiskScore(address(0xA11CE)) == 8500, "sybil score");
        require(antiSybil.promotionalRewardBlocked(address(0xA11CE)), "promo blocked");
        require(antiSybil.enhancedBondRequired(address(0xA11CE)) == 5_000_000, "enhanced bond");

        try antiSybil.setSybilRisk(address(0xA11CE), 10_001, keccak256("range")) {
            revert("sybil score above max should fail");
        } catch { }
    }

    function _bondContext(AlterfordTypes.EntityType entityType)
        private
        pure
        returns (CreationBondPolicy.BondContext memory)
    {
        return CreationBondPolicy.BondContext({
            entityType: entityType,
            mode: AlterfordTypes.Mode.Vanilla,
            creatorTier: AlterfordTypes.CreatorTier.Basic,
            categoryRisk: AlterfordTypes.RiskLevel.Low,
            reputation: AlterfordTypes.ReputationBand.New,
            expectedVolume: 20_000_000,
            disputeCount: 0,
            fraudCount: 0
        });
    }
}
