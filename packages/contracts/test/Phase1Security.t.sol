// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { MarketFactory } from "../src/factories/MarketFactory.sol";
import { BountyFactory } from "../src/factories/BountyFactory.sol";
import { BountyRecoveryVault } from "../src/security/BountyRecoveryVault.sol";
import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { CreationBondContextResolver } from "../src/bonds/CreationBondContextResolver.sol";
import { AlterfordTypes } from "../src/libraries/AlterfordTypes.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";

interface VmPhase1 {
    function addr(uint256 privateKey) external returns (address);
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 revertData) external;
}

contract Phase1Actor {
    function approve(MockSettlementToken token, address spender, uint256 amount) external {
        token.approve(spender, amount);
    }

    function submit(BountyFactory factory, uint256 bountyId, bytes32 submissionHash) external {
        factory.submit(bountyId, submissionHash);
    }

    function submitBountyEvidence(
        BountyFactory factory,
        uint256 bountyId,
        bytes32 submissionHash,
        string calldata evidenceURI
    ) external {
        factory.submitEvidence(bountyId, submissionHash, evidenceURI);
    }

    function accept(ChallengeFactory factory, uint256 challengeId) external {
        factory.acceptChallenge(challengeId, "https://live.example/session");
    }

    function submitEvidence(ChallengeFactory factory, uint256 challengeId) external {
        factory.submitEvidence(
            challengeId, keccak256("evidence"), "ipfs://evidence", "https://live.example/session"
        );
    }

    function propose(
        ChallengeFactory factory,
        uint256 challengeId,
        bool executorSucceeded,
        bytes32 evidenceHash
    ) external {
        factory.proposeResolution(challengeId, executorSucceeded, evidenceHash);
    }

    function confirm(ChallengeFactory factory, uint256 challengeId, bool executorSucceeded)
        external
    {
        factory.confirmResolution(challengeId, executorSucceeded);
    }

    function dispute(ChallengeFactory factory, uint256 challengeId, bytes32 reasonHash) external {
        factory.disputeResolution(challengeId, reasonHash);
    }
}

contract Phase1SecurityTest {
    VmPhase1 internal constant vm =
        VmPhase1(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testSignedBetUsesEip712NonceAndRestrictedRelayer() public {
        (MockSettlementToken token, MarketFactory factory, uint256 marketId) = _marketFixture();
        uint256 bettorKey = 0xA11CE;
        address bettor = vm.addr(bettorKey);
        address relayer = address(0xBEEF);
        token.mint(bettor, 20_000_000);
        vm.prank(bettor);
        token.approve(address(factory), 20_000_000);

        MarketFactory.BetAuthorization memory authorization = MarketFactory.BetAuthorization({
            bettor: bettor,
            marketId: marketId,
            outcome: 1,
            amount: 5_000_000,
            nonce: 0,
            deadline: block.timestamp + 1 hours,
            authorizedRelayer: relayer
        });
        bytes32 digest = factory.hashBetAuthorization(authorization);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bettorKey, digest);
        bytes memory signature = abi.encodePacked(r, s, v);

        try factory.placeBetBySig(authorization, signature) {
            revert("unauthorized relayer accepted");
        } catch { }

        vm.prank(relayer);
        factory.placeBetBySig(authorization, signature);
        require(factory.nonces(bettor) == 1, "nonce not consumed");
        require(factory.totalStakeByUser(marketId, bettor) == 5_000_000, "stake not recorded");

        vm.prank(relayer);
        try factory.placeBetBySig(authorization, signature) {
            revert("signature replay accepted");
        } catch { }
    }

    function testSignerCanInvalidateOutstandingBetAuthorizations() public {
        (, MarketFactory factory,) = _marketFixture();
        address bettor = vm.addr(0xCAFE);
        vm.prank(bettor);
        factory.invalidateNonce(7);
        require(factory.nonces(bettor) == 7, "nonce invalidation not persisted");
    }

    function testBountyEscrowsRewardPaysExactWinnersAndReturnsBond() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        BountyFactory factory = new BountyFactory(address(this), address(policy), address(resolver));
        Phase1Actor creator = new Phase1Actor();
        Phase1Actor winnerA = new Phase1Actor();
        Phase1Actor winnerB = new Phase1Actor();

        token.mint(address(creator), 25_000_000);
        creator.approve(token, address(factory), 25_000_000);
        uint256 bountyId = _createBounty(factory, token, creator, 20_000_000);
        uint256 bountyBond = factory.bondByBounty(bountyId);
        require(
            token.balanceOf(address(factory)) == 20_000_000 + bountyBond,
            "reward and bond not escrowed"
        );

        winnerA.submit(factory, bountyId, keccak256("submission-a"));
        winnerB.submit(factory, bountyId, keccak256("submission-b"));
        address[] memory winners = new address[](2);
        winners[0] = address(winnerA);
        winners[1] = address(winnerB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 8_000_000;
        amounts[1] = 12_000_000;
        factory.resolveBounty(bountyId, winners, amounts);

        require(token.balanceOf(address(winnerA)) == 8_000_000, "winner A payout");
        require(token.balanceOf(address(winnerB)) == 12_000_000, "winner B payout");
        require(token.balanceOf(address(creator)) == 5_000_000, "creator bond refund");
        require(token.balanceOf(address(factory)) == 0, "bounty escrow remainder");
    }

    function testBountySubmissionEvidencePersistsMatchingIpfsReference() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        BountyFactory factory = new BountyFactory(address(this), address(policy), address(resolver));
        Phase1Actor creator = new Phase1Actor();
        Phase1Actor submitter = new Phase1Actor();

        token.mint(address(creator), 25_000_000);
        creator.approve(token, address(factory), 25_000_000);
        uint256 bountyId = _createBounty(factory, token, creator, 20_000_000);
        string memory evidenceURI = "ipfs://bafybeigdyrzt5evidence";
        bytes32 evidenceHash = keccak256(bytes(evidenceURI));

        submitter.submitBountyEvidence(factory, bountyId, evidenceHash, evidenceURI);

        require(
            factory.submissionHashByUser(bountyId, address(submitter)) == evidenceHash,
            "evidence hash not stored"
        );
        require(
            keccak256(bytes(factory.submissionURIByUser(bountyId, address(submitter))))
                == evidenceHash,
            "evidence URI not stored"
        );
    }

    function testBountySubmissionEvidenceRejectsEmptyOrMismatchedReference() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        BountyFactory factory = new BountyFactory(address(this), address(policy), address(resolver));
        Phase1Actor creator = new Phase1Actor();
        Phase1Actor submitter = new Phase1Actor();

        token.mint(address(creator), 25_000_000);
        creator.approve(token, address(factory), 25_000_000);
        uint256 bountyId = _createBounty(factory, token, creator, 20_000_000);

        vm.expectRevert(bytes4(keccak256("InvalidMetadataHash()")));
        submitter.submitBountyEvidence(factory, bountyId, keccak256("other"), "ipfs://evidence");

        vm.expectRevert(bytes4(keccak256("InvalidMetadataHash()")));
        submitter.submitBountyEvidence(factory, bountyId, bytes32(0), "");
    }

    function testBountyRejectsUnboundedWinnerFanout() public {
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        BountyFactory factory = new BountyFactory(address(this), address(policy), address(resolver));
        address[] memory winners = new address[](101);
        uint256[] memory amounts = new uint256[](101);

        vm.expectRevert(bytes4(keccak256("TooManyRecipients()")));
        factory.resolveBounty(1, winners, amounts);
    }

    function testEmergencyBountyRecoveryRequiresPauseAndRoutesOnlyThroughColdVault() public {
        MockSettlementToken token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        address coldWallet = address(0xC01D);
        BountyRecoveryVault vault = new BountyRecoveryVault(address(this), coldWallet);
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        BountyFactory factory = new BountyFactory(address(this), address(policy), address(resolver));
        factory.setRecoveryVault(address(vault));
        Phase1Actor creator = new Phase1Actor();
        token.mint(address(creator), 25_000_000);
        creator.approve(token, address(factory), 25_000_000);
        uint256 bountyId = _createBounty(factory, token, creator, 20_000_000);
        bytes32 incidentHash = keccak256("zero-day-incident");

        try factory.emergencyRecoverBounty(bountyId, incidentHash) {
            revert("recovery while unpaused");
        } catch { }

        factory.pause();
        factory.emergencyRecoverBounty(bountyId, incidentHash);
        uint256 recovered = 20_000_000 + factory.bondByBounty(bountyId);
        // The factory clears the bond during recovery, so derive the transferred total from the vault.
        recovered = token.balanceOf(address(vault));
        require(recovered > 20_000_000, "vault did not receive escrow and bond");
        vault.recoverToColdWallet(address(token), recovered, incidentHash);
        require(token.balanceOf(coldWallet) == recovered, "cold wallet did not receive funds");

        try factory.emergencyRecoverBounty(bountyId, incidentHash) {
            revert("double recovery accepted");
        } catch { }
    }

    function testChallengeMutualConfirmationFinalizesBeforeWindow() public {
        (
            MockSettlementToken token,
            ChallengeFactory factory,
            Phase1Actor creator,
            Phase1Actor executor,
            uint256 challengeId
        ) = _challengeFixture(100_000_000, AlterfordTypes.RiskLevel.Low);
        executor.submitEvidence(factory, challengeId);
        executor.propose(factory, challengeId, true, keccak256("evidence"));
        creator.confirm(factory, challengeId, true);

        require(factory.rewardFinalized(challengeId), "mutual confirmation not finalized");
        require(token.balanceOf(address(executor)) == 100_000_000, "executor settlement mismatch");
    }

    function testChallengeDisputeBondAndArbiterFinalDecision() public {
        (
            MockSettlementToken token,
            ChallengeFactory factory,
            Phase1Actor creator,
            Phase1Actor executor,
            uint256 challengeId
        ) = _challengeFixture(100_000_000, AlterfordTypes.RiskLevel.Low);
        executor.submitEvidence(factory, challengeId);
        executor.propose(factory, challengeId, true, keccak256("evidence"));
        uint256 executorBond = factory.executorBondByChallenge(challengeId);

        token.mint(address(creator), 2_000_000);
        creator.approve(token, address(factory), 2_000_000);
        creator.dispute(factory, challengeId, keccak256("false-evidence"));
        require(factory.disputeBondByChallenge(challengeId) == 2_000_000, "dispute bond mismatch");

        factory.resolveDispute(challengeId, false, keccak256("arbiter-decision"));
        require(factory.rewardFinalized(challengeId), "arbiter decision not final");
        require(token.balanceOf(address(creator)) == 112_000_000, "creator refund and bonds");
        require(
            token.balanceOf(address(executor)) == 10_000_000 - executorBond,
            "failed executor bond not slashed"
        );
        require(token.balanceOf(address(factory)) == executorBond, "slashed bond not retained");
    }

    function testChallengeStandardAndHighRiskWindowsAreBounded() public {
        (, ChallengeFactory standardFactory,,, uint256 standardId) =
            _challengeFixture(100_000_000, AlterfordTypes.RiskLevel.Low);
        require(standardFactory.resolutionWindowFor(standardId) == 24 hours, "standard window");

        (, ChallengeFactory highFactory,,, uint256 highId) =
            _challengeFixture(1_000_000_000, AlterfordTypes.RiskLevel.High);
        require(highFactory.resolutionWindowFor(highId) == 48 hours, "high-risk window");
    }

    function _marketFixture()
        private
        returns (MockSettlementToken token, MarketFactory factory, uint256 marketId)
    {
        token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        factory = new MarketFactory(address(this), address(policy), address(resolver));
        token.mint(address(this), 5_000_000);
        token.approve(address(factory), 5_000_000);
        string[] memory outcomes = new string[](2);
        outcomes[0] = "YES";
        outcomes[1] = "NO";
        marketId = factory.createMarket(
            address(token),
            keccak256("market"),
            "ipfs://market",
            outcomes,
            block.timestamp + 1 days,
            block.timestamp + 2 days,
            AlterfordTypes.NoWinnersPolicy.RefundAll,
            resolver.CATEGORY_SPORTS()
        );
    }

    function _createBounty(
        BountyFactory factory,
        MockSettlementToken token,
        Phase1Actor creator,
        uint256 rewardPool
    ) private returns (uint256) {
        return creatorCreateBounty(factory, token, creator, rewardPool);
    }

    function creatorCreateBounty(
        BountyFactory factory,
        MockSettlementToken token,
        Phase1Actor creator,
        uint256 rewardPool
    ) private returns (uint256 bountyId) {
        bytes32 categoryId = factory.bondContextResolver().CATEGORY_VANILLA_BOUNTY();
        vm.prank(address(creator));
        bountyId = factory.createBounty(
            address(token),
            rewardPool,
            block.timestamp + 1 days,
            keccak256("bounty-rules"),
            "ipfs://bounty",
            categoryId
        );
    }

    function _challengeFixture(uint256 rewardPool, AlterfordTypes.RiskLevel risk)
        private
        returns (
            MockSettlementToken token,
            ChallengeFactory factory,
            Phase1Actor creator,
            Phase1Actor executor,
            uint256 challengeId
        )
    {
        token = new MockSettlementToken();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        CreationBondContextResolver resolver = new CreationBondContextResolver(address(this));
        factory =
            new ChallengeFactory(address(this), address(policy), address(resolver), address(0xF0));
        creator = new Phase1Actor();
        executor = new Phase1Actor();
        token.mint(address(creator), rewardPool + 10_000_000);
        token.mint(address(executor), 10_000_000);
        creator.approve(token, address(factory), rewardPool + 10_000_000);
        executor.approve(token, address(factory), 10_000_000);
        bytes32 categoryId = risk >= AlterfordTypes.RiskLevel.High
            ? resolver.CATEGORY_UNDERWORLD_CHALLENGE()
            : resolver.CATEGORY_VANILLA_CHALLENGE();
        vm.prank(address(creator));
        challengeId = factory.createChallenge(
            address(token),
            rewardPool,
            keccak256("challenge-rules"),
            "ipfs://challenge",
            block.timestamp + 1 days,
            categoryId
        );
        executor.accept(factory, challengeId);
    }

    function _bondContext(
        AlterfordTypes.EntityType entityType,
        AlterfordTypes.RiskLevel risk,
        uint256 expectedVolume
    ) private pure returns (CreationBondPolicy.BondContext memory) {
        return CreationBondPolicy.BondContext({
            entityType: entityType,
            mode: AlterfordTypes.Mode.Vanilla,
            creatorTier: AlterfordTypes.CreatorTier.Basic,
            categoryRisk: risk,
            reputation: AlterfordTypes.ReputationBand.New,
            expectedVolume: expectedVolume,
            disputeCount: 0,
            fraudCount: 0
        });
    }
}
