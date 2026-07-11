// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { ReentrancyGuardLite } from "../security/ReentrancyGuardLite.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { FeePolicy } from "../libraries/FeePolicy.sol";
import { CreationBondPolicy } from "../bonds/CreationBondPolicy.sol";
import { IERC20 } from "../token/IERC20.sol";

contract ChallengeFactory is Governed, ReentrancyGuardLite {
    struct Challenge {
        address creator;
        address executor;
        address settlementToken;
        bytes32 rulesHash;
        string metadataURI;
        string liveStreamURI;
        uint256 rewardPool;
        uint256 deadline;
        AlterfordTypes.ChallengeState state;
        bytes32 evidenceHash;
        string evidenceURI;
    }

    uint256 public nextChallengeId = 1;
    CreationBondPolicy public bondPolicy;
    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => uint256) public bondByChallenge;
    mapping(uint256 => uint256) public executorBondByChallenge;
    mapping(uint256 => bool) public bondFinalized;
    mapping(uint256 => bool) public rewardFinalized;

    event ChallengeCreated(
        uint256 indexed challengeId, address indexed creator, uint256 rewardPool, bytes32 rulesHash
    );
    event ChallengeAccepted(
        uint256 indexed challengeId, address indexed executor, uint256 executorBond
    );
    event ChallengeLiveStreamUpdated(
        uint256 indexed challengeId, address indexed actor, string liveStreamURI
    );
    event ChallengeEvidenceSubmitted(
        uint256 indexed challengeId,
        address indexed executor,
        bytes32 evidenceHash,
        string evidenceURI,
        string liveStreamURI
    );
    event ChallengeResolved(
        uint256 indexed challengeId,
        address indexed winner,
        bool executorSucceeded,
        uint256 rewardPayout,
        uint256 adminFee,
        uint256 creatorFee
    );
    event ChallengeCancelled(uint256 indexed challengeId, bytes32 reasonHash);
    event ChallengeFraudConfirmed(
        uint256 indexed challengeId, address indexed offender, bytes32 reasonHash
    );
    event BondPolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
    event BondCalculated(
        bytes32 indexed entityType,
        uint256 indexed entityId,
        address indexed creator,
        uint256 requiredBond,
        uint16 reasonFlags
    );
    event BondLocked(
        bytes32 indexed entityType,
        uint256 indexed entityId,
        address indexed creator,
        uint256 amount
    );
    event BondReleased(
        bytes32 indexed entityType,
        uint256 indexed entityId,
        address indexed creator,
        uint256 amount
    );
    event BondSlashed(
        bytes32 indexed entityType, uint256 indexed entityId, uint256 amount, bytes32 reasonHash
    );

    constructor(address initialAdmin, address initialBondPolicy) Governed(initialAdmin) {
        if (initialBondPolicy == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        bondPolicy = CreationBondPolicy(initialBondPolicy);
        emit BondPolicyUpdated(address(0), initialBondPolicy);
    }

    function setBondPolicy(address nextBondPolicy) external onlyRole(GOVERNOR_ROLE) {
        if (nextBondPolicy == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        address oldPolicy = address(bondPolicy);
        bondPolicy = CreationBondPolicy(nextBondPolicy);
        emit BondPolicyUpdated(oldPolicy, nextBondPolicy);
    }

    function createChallenge(
        address settlementToken,
        uint256 rewardPool,
        bytes32 rulesHash,
        string calldata metadataURI,
        uint256 deadline,
        CreationBondPolicy.BondContext calldata bondContext
    ) external nonReentrant whenNotPaused returns (uint256 challengeId) {
        if (settlementToken == address(0)) revert AlterfordErrors.InvalidToken();
        if (rewardPool == 0) revert AlterfordErrors.InvalidAmount();
        if (rulesHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        if (deadline <= block.timestamp) revert AlterfordErrors.InvalidAmount();
        if (bondContext.entityType != AlterfordTypes.EntityType.Challenge) {
            revert AlterfordErrors.InvalidBondPolicy();
        }

        (uint256 requiredBond, uint16 reasonFlags) = bondPolicy.previewBond(bondContext);
        challengeId = nextChallengeId++;

        challenges[challengeId] = Challenge({
            creator: msg.sender,
            executor: address(0),
            settlementToken: settlementToken,
            rulesHash: rulesHash,
            metadataURI: metadataURI,
            liveStreamURI: "",
            rewardPool: rewardPool,
            deadline: deadline,
            state: AlterfordTypes.ChallengeState.Open,
            evidenceHash: bytes32(0),
            evidenceURI: ""
        });
        bondByChallenge[challengeId] = requiredBond;
        if (!IERC20(settlementToken)
                .transferFrom(msg.sender, address(this), requiredBond + rewardPool)) {
            revert AlterfordErrors.TransferFailed();
        }

        emit BondCalculated("Challenge", challengeId, msg.sender, requiredBond, reasonFlags);
        emit BondLocked("Challenge", challengeId, msg.sender, requiredBond);
        emit ChallengeCreated(challengeId, msg.sender, rewardPool, rulesHash);
    }

    function acceptChallenge(uint256 challengeId, string calldata liveStreamURI)
        external
        nonReentrant
        whenNotPaused
    {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Open) {
            revert AlterfordErrors.InvalidState();
        }
        if (challenge.creator == address(0)) revert AlterfordErrors.InvalidState();
        if (block.timestamp > challenge.deadline) revert AlterfordErrors.InvalidState();
        if (msg.sender == challenge.creator) revert AlterfordErrors.InvalidState();

        uint256 executorBond = bondByChallenge[challengeId];
        challenge.executor = msg.sender;
        challenge.liveStreamURI = liveStreamURI;
        challenge.state = AlterfordTypes.ChallengeState.Accepted;
        executorBondByChallenge[challengeId] = executorBond;

        if (!IERC20(challenge.settlementToken)
                .transferFrom(msg.sender, address(this), executorBond)) {
            revert AlterfordErrors.TransferFailed();
        }

        emit BondLocked("ChallengeExecutor", challengeId, msg.sender, executorBond);
        emit ChallengeAccepted(challengeId, msg.sender, executorBond);
        if (bytes(liveStreamURI).length != 0) {
            emit ChallengeLiveStreamUpdated(challengeId, msg.sender, liveStreamURI);
        }
    }

    function updateLiveStreamURI(uint256 challengeId, string calldata liveStreamURI)
        external
        whenNotPaused
    {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Accepted) {
            revert AlterfordErrors.InvalidState();
        }
        if (msg.sender != challenge.executor && msg.sender != challenge.creator) {
            revert AlterfordErrors.Unauthorized();
        }
        challenge.liveStreamURI = liveStreamURI;
        emit ChallengeLiveStreamUpdated(challengeId, msg.sender, liveStreamURI);
    }

    function submitEvidence(
        uint256 challengeId,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        string calldata liveStreamURI
    ) external whenNotPaused {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Accepted) {
            revert AlterfordErrors.InvalidState();
        }
        if (msg.sender != challenge.executor) revert AlterfordErrors.Unauthorized();
        if (evidenceHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        if (block.timestamp > challenge.deadline) revert AlterfordErrors.InvalidState();

        challenge.evidenceHash = evidenceHash;
        challenge.evidenceURI = evidenceURI;
        challenge.liveStreamURI = liveStreamURI;
        challenge.state = AlterfordTypes.ChallengeState.EvidenceSubmitted;

        emit ChallengeEvidenceSubmitted(
            challengeId, msg.sender, evidenceHash, evidenceURI, liveStreamURI
        );
        if (bytes(liveStreamURI).length != 0) {
            emit ChallengeLiveStreamUpdated(challengeId, msg.sender, liveStreamURI);
        }
    }

    function resolveChallenge(
        uint256 challengeId,
        bool executorSucceeded,
        bool slashCreatorBond,
        bool slashExecutorBond,
        bytes32 reasonHash
    ) external nonReentrant onlyRole(RESOLVER_ROLE) {
        Challenge storage challenge = challenges[challengeId];
        if (
            challenge.state != AlterfordTypes.ChallengeState.Accepted
                && challenge.state != AlterfordTypes.ChallengeState.EvidenceSubmitted
                && challenge.state != AlterfordTypes.ChallengeState.Review
        ) revert AlterfordErrors.InvalidState();
        if (rewardFinalized[challengeId]) revert AlterfordErrors.AlreadyClaimed();

        challenge.state = AlterfordTypes.ChallengeState.Resolved;
        rewardFinalized[challengeId] = true;

        uint256 rewardPayout;
        uint256 adminFee;
        uint256 creatorFee;

        if (executorSucceeded) {
            (rewardPayout, adminFee, creatorFee) = _settleReward(challenge);
        } else if (!IERC20(challenge.settlementToken)
                .transfer(challenge.creator, challenge.rewardPool)) {
            revert AlterfordErrors.TransferFailed();
        }

        _finalizeCreatorBond(challengeId, challenge, slashCreatorBond, reasonHash);
        _finalizeExecutorBond(challengeId, challenge, slashExecutorBond, reasonHash);

        address winner = executorSucceeded ? challenge.executor : challenge.creator;
        emit ChallengeResolved(
            challengeId, winner, executorSucceeded, rewardPayout, adminFee, creatorFee
        );
    }

    function cancelChallenge(uint256 challengeId, bytes32 reasonHash)
        external
        nonReentrant
        onlyRole(ARBITER_ROLE)
    {
        Challenge storage challenge = challenges[challengeId];
        if (
            challenge.state != AlterfordTypes.ChallengeState.Open
                && challenge.state != AlterfordTypes.ChallengeState.Accepted
                && challenge.state != AlterfordTypes.ChallengeState.EvidenceSubmitted
        ) revert AlterfordErrors.InvalidState();
        if (rewardFinalized[challengeId]) revert AlterfordErrors.AlreadyClaimed();

        challenge.state = AlterfordTypes.ChallengeState.Cancelled;
        rewardFinalized[challengeId] = true;

        if (!IERC20(challenge.settlementToken).transfer(challenge.creator, challenge.rewardPool)) {
            revert AlterfordErrors.TransferFailed();
        }
        _finalizeCreatorBond(challengeId, challenge, false, reasonHash);
        _finalizeExecutorBond(challengeId, challenge, false, reasonHash);

        emit ChallengeCancelled(challengeId, reasonHash);
    }

    function releaseBond(uint256 challengeId) external nonReentrant onlyRole(GOVERNOR_ROLE) {
        if (bondFinalized[challengeId]) revert AlterfordErrors.BondAlreadyFinalized();
        uint256 amount = bondByChallenge[challengeId];
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        Challenge storage challenge = challenges[challengeId];
        bondFinalized[challengeId] = true;
        bondByChallenge[challengeId] = 0;
        if (!IERC20(challenge.settlementToken).transfer(challenge.creator, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondReleased("Challenge", challengeId, challenge.creator, amount);
    }

    function slashBond(uint256 challengeId, bytes32 reasonHash) external onlyRole(ARBITER_ROLE) {
        if (bondFinalized[challengeId]) revert AlterfordErrors.BondAlreadyFinalized();
        uint256 amount = bondByChallenge[challengeId];
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        bondFinalized[challengeId] = true;
        bondByChallenge[challengeId] = 0;
        emit BondSlashed("Challenge", challengeId, amount, reasonHash);
    }

    function confirmFraud(uint256 challengeId, address offender, bytes32 reasonHash)
        external
        nonReentrant
        onlyRole(ARBITER_ROLE)
    {
        Challenge storage challenge = challenges[challengeId];
        if (
            challenge.state != AlterfordTypes.ChallengeState.Open
                && challenge.state != AlterfordTypes.ChallengeState.Accepted
                && challenge.state != AlterfordTypes.ChallengeState.EvidenceSubmitted
        ) revert AlterfordErrors.InvalidState();
        if (offender != challenge.creator && offender != challenge.executor) {
            revert AlterfordErrors.InvalidState();
        }

        challenge.state = AlterfordTypes.ChallengeState.Fraud;
        if (!rewardFinalized[challengeId]) {
            rewardFinalized[challengeId] = true;
            if (!IERC20(challenge.settlementToken)
                    .transfer(challenge.creator, challenge.rewardPool)) {
                revert AlterfordErrors.TransferFailed();
            }
        }

        _finalizeCreatorBond(challengeId, challenge, offender == challenge.creator, reasonHash);
        _finalizeExecutorBond(challengeId, challenge, offender == challenge.executor, reasonHash);

        emit ChallengeFraudConfirmed(challengeId, offender, reasonHash);
    }

    function _settleReward(Challenge storage challenge)
        private
        returns (uint256 rewardPayout, uint256 adminFee, uint256 creatorFee)
    {
        uint256 totalFee;
        (adminFee, creatorFee, totalFee) = FeePolicy.challengeFees(challenge.rewardPool);
        rewardPayout = challenge.rewardPool - totalFee;

        if (adminFee > 0 && !IERC20(challenge.settlementToken).transfer(admin, adminFee)) {
            revert AlterfordErrors.TransferFailed();
        }
        if (
            creatorFee > 0
                && !IERC20(challenge.settlementToken).transfer(challenge.creator, creatorFee)
        ) {
            revert AlterfordErrors.TransferFailed();
        }
        if (!IERC20(challenge.settlementToken).transfer(challenge.executor, rewardPayout)) {
            revert AlterfordErrors.TransferFailed();
        }
    }

    function _finalizeCreatorBond(
        uint256 challengeId,
        Challenge storage challenge,
        bool slash,
        bytes32 reasonHash
    ) private {
        if (bondFinalized[challengeId]) return;
        uint256 amount = bondByChallenge[challengeId];
        if (amount == 0) return;
        bondFinalized[challengeId] = true;
        bondByChallenge[challengeId] = 0;
        if (slash) {
            emit BondSlashed("Challenge", challengeId, amount, reasonHash);
            return;
        }
        if (!IERC20(challenge.settlementToken).transfer(challenge.creator, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondReleased("Challenge", challengeId, challenge.creator, amount);
    }

    function _finalizeExecutorBond(
        uint256 challengeId,
        Challenge storage challenge,
        bool slash,
        bytes32 reasonHash
    ) private {
        uint256 amount = executorBondByChallenge[challengeId];
        if (amount == 0) return;
        executorBondByChallenge[challengeId] = 0;
        if (slash) {
            emit BondSlashed("ChallengeExecutor", challengeId, amount, reasonHash);
            return;
        }
        if (!IERC20(challenge.settlementToken).transfer(challenge.executor, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondReleased("ChallengeExecutor", challengeId, challenge.executor, amount);
    }
}
