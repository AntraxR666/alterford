// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { CreationBondContextResolver } from "../src/bonds/CreationBondContextResolver.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";

contract PerformerOfferActor {
    function approveToken(MockSettlementToken token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function createOffer(
        ChallengeFactory factory,
        MockSettlementToken token,
        uint256 requestedReward,
        uint256 deadline
    ) external returns (uint256) {
        return factory.createChallenge(
            address(token),
            requestedReward,
            keccak256("performer-offer-rules"),
            "alterford://challenge?title=Performer%20offer",
            deadline,
            factory.bondContextResolver().CATEGORY_VANILLA_PERFORMER_OFFER()
        );
    }

    function accept(ChallengeFactory factory, uint256 challengeId) external {
        factory.acceptChallenge(challengeId, "https://live.example/performer-offer");
    }

    function submitEvidence(ChallengeFactory factory, uint256 challengeId) external {
        factory.submitEvidence(
            challengeId,
            keccak256("performer-proof"),
            "ipfs://performer-proof",
            "https://live.example/performer-proof"
        );
    }
}

contract PerformerOfferChallengeTest {
    MockSettlementToken internal token;
    CreationBondPolicy internal policy;
    CreationBondContextResolver internal resolver;
    ChallengeFactory internal factory;
    PerformerOfferActor internal performer;
    PerformerOfferActor internal sponsor;

    function setUp() public {
        token = new MockSettlementToken();
        policy = new CreationBondPolicy(address(this));
        resolver = new CreationBondContextResolver(address(this));
        factory =
            new ChallengeFactory(address(this), address(policy), address(resolver), address(0xF0));
        performer = new PerformerOfferActor();
        sponsor = new PerformerOfferActor();
    }

    function testOfferCreationLocksOnlyDynamicPerformerBond() public {
        token.mint(address(performer), 5_000_000);
        performer.approveToken(token, address(factory), 5_000_000);

        uint256 challengeId =
            performer.createOffer(factory, token, 100_000_000, block.timestamp + 1 days);

        require(factory.bondByChallenge(challengeId) == 5_000_000, "dynamic bond locked");
        require(token.balanceOf(address(factory)) == 5_000_000, "reward not charged to performer");
        require(
            factory.fundingModelByChallenge(challengeId)
                == ChallengeFactory.ChallengeFundingModel.PerformerOffer,
            "performer funding model stored"
        );
        require(!factory.rewardEscrowedByChallenge(challengeId), "reward awaits sponsor");
    }

    function testSponsorFundsRewardAndPerformerReceivesNetPayoutOnSuccess() public {
        uint256 challengeId = _createOffer(100_000_000);
        token.mint(address(sponsor), 100_000_000);
        sponsor.approveToken(token, address(factory), 100_000_000);

        sponsor.accept(factory, challengeId);

        require(factory.rewardEscrowedByChallenge(challengeId), "reward escrowed on acceptance");
        require(factory.executorBondByChallenge(challengeId) == 0, "sponsor pays no executor bond");
        require(token.balanceOf(address(factory)) == 105_000_000, "bond and reward escrowed");

        try sponsor.submitEvidence(factory, challengeId) {
            revert("sponsor must not submit performer evidence");
        } catch { }
        performer.submitEvidence(factory, challengeId);

        factory.resolveChallenge(challengeId, true, false, false, keccak256("fulfilled"));

        require(token.balanceOf(address(performer)) == 95_000_000, "performer paid net plus bond");
        require(token.balanceOf(address(this)) == 10_000_000, "existing challenge fee preserved");
        require(token.balanceOf(address(sponsor)) == 0, "sponsor funded successful challenge");
        require(token.balanceOf(address(factory)) == 0, "escrow settled exactly");
    }

    function testUnfulfilledOfferRefundsSponsorAndCanSlashPerformerBond() public {
        uint256 challengeId = _createOffer(20_000_000);
        token.mint(address(sponsor), 20_000_000);
        sponsor.approveToken(token, address(factory), 20_000_000);
        sponsor.accept(factory, challengeId);

        factory.resolveChallenge(challengeId, false, true, false, keccak256("not-fulfilled"));

        require(token.balanceOf(address(sponsor)) == 20_000_000, "sponsor fully refunded");
        require(token.balanceOf(address(performer)) == 0, "performer bond slashed");
        require(token.balanceOf(address(factory)) == 5_000_000, "slashed bond retained");
    }

    function testCancellationBeforeAcceptanceReturnsOnlyPerformerBond() public {
        uint256 challengeId = _createOffer(20_000_000);

        factory.cancelChallenge(challengeId, keccak256("cancelled-before-funding"));

        require(token.balanceOf(address(performer)) == 5_000_000, "performer bond returned");
        require(token.balanceOf(address(factory)) == 0, "no phantom reward refund");
    }

    function testInsufficientSponsorFundsCannotAcceptOffer() public {
        uint256 challengeId = _createOffer(20_000_000);
        token.mint(address(sponsor), 19_999_999);
        sponsor.approveToken(token, address(factory), 19_999_999);

        try sponsor.accept(factory, challengeId) {
            revert("insufficient sponsor funds should fail");
        } catch { }

        require(!factory.rewardEscrowedByChallenge(challengeId), "reward remains unfunded");
        require(factory.executorBondByChallenge(challengeId) == 0, "no partial bond state");
        require(token.balanceOf(address(factory)) == 5_000_000, "only performer bond remains");
    }

    function _createOffer(uint256 requestedReward) private returns (uint256 challengeId) {
        token.mint(address(performer), 5_000_000);
        performer.approveToken(token, address(factory), 5_000_000);
        challengeId =
            performer.createOffer(factory, token, requestedReward, block.timestamp + 1 days);
    }
}
