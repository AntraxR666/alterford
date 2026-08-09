// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { ReentrancyGuardLite } from "../security/ReentrancyGuardLite.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { FeePolicy } from "../libraries/FeePolicy.sol";
import { CreationBondPolicy } from "../bonds/CreationBondPolicy.sol";
import { CreationBondContextResolver } from "../bonds/CreationBondContextResolver.sol";
import { IERC20 } from "../token/IERC20.sol";
import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

contract ChallengeFactory is Governed, ReentrancyGuardLite, ERC2771Context {
    enum ChallengeFundingModel {
        Sponsored,
        PerformerOffer
    }

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
        bytes32 categoryId;
        AlterfordTypes.Mode mode;
        AlterfordTypes.RiskLevel riskLevel;
    }

    struct ResolutionProposal {
        address proposer;
        bool executorSucceeded;
        bytes32 evidenceHash;
        uint64 proposedAt;
        uint64 disputeDeadline;
    }

    struct PermitData {
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    uint256 public constant HIGH_VALUE_THRESHOLD = 1_000_000_000;
    uint256 public constant MIN_DISPUTE_BOND = 1_000_000;
    uint256 public constant MAX_DISPUTE_BOND = 100_000_000;
    uint64 public constant MIN_STANDARD_RESOLUTION_WINDOW = 12 hours;
    uint64 public constant MAX_STANDARD_RESOLUTION_WINDOW = 24 hours;
    uint64 public constant HIGH_RISK_RESOLUTION_WINDOW = 48 hours;
    bytes32 private constant VANILLA_PERFORMER_OFFER_CATEGORY =
        keccak256("VANILLA_PERFORMER_OFFER");
    bytes32 private constant UNDERWORLD_PERFORMER_OFFER_CATEGORY =
        keccak256("UNDERWORLD_PERFORMER_OFFER");

    uint256 public nextChallengeId = 1;
    CreationBondPolicy public bondPolicy;
    CreationBondContextResolver public bondContextResolver;
    uint64 public standardResolutionWindow = MAX_STANDARD_RESOLUTION_WINDOW;
    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => uint256) public bondByChallenge;
    mapping(uint256 => uint256) public executorBondByChallenge;
    mapping(uint256 => ChallengeFundingModel) public fundingModelByChallenge;
    mapping(uint256 => bool) public rewardEscrowedByChallenge;
    mapping(uint256 => bool) public bondFinalized;
    mapping(uint256 => bool) public rewardFinalized;
    mapping(uint256 => ResolutionProposal) public resolutionProposalByChallenge;
    mapping(uint256 => address) public disputantByChallenge;
    mapping(uint256 => uint256) public disputeBondByChallenge;

    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed creator,
        uint256 rewardPool,
        bytes32 rulesHash,
        bytes32 categoryId,
        AlterfordTypes.Mode mode,
        AlterfordTypes.RiskLevel riskLevel
    );
    event ChallengeAccepted(
        uint256 indexed challengeId, address indexed executor, uint256 executorBond
    );
    event ChallengeFundingModelSelected(
        uint256 indexed challengeId,
        ChallengeFundingModel fundingModel,
        address indexed performer,
        address indexed sponsor
    );
    event ChallengeRewardFunded(
        uint256 indexed challengeId, address indexed sponsor, uint256 rewardPool
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
    event ResolutionWindowUpdated(uint64 oldWindow, uint64 newWindow);
    event ChallengeResolutionProposed(
        uint256 indexed challengeId,
        address indexed proposer,
        bool executorSucceeded,
        bytes32 evidenceHash,
        uint64 disputeDeadline
    );
    event ChallengeResolutionConfirmed(
        uint256 indexed challengeId, address indexed confirmer, bool executorSucceeded
    );
    event ChallengeResolutionDisputed(
        uint256 indexed challengeId,
        address indexed disputant,
        uint256 bondAmount,
        bytes32 reasonHash
    );
    event ChallengeDisputeResolved(
        uint256 indexed challengeId,
        bool executorSucceeded,
        bool disputeSucceeded,
        bytes32 reasonHash
    );
    event ChallengeResolvedEarly(
        uint256 indexed challengeId, bool executorSucceeded, bytes32 reasonHash
    );
    event BondPolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
    event BondContextResolverUpdated(address indexed oldResolver, address indexed newResolver);
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

    constructor(
        address initialAdmin,
        address initialBondPolicy,
        address initialBondContextResolver,
        address trustedForwarder
    ) Governed(initialAdmin) ERC2771Context(trustedForwarder) {
        if (initialBondPolicy == address(0) || initialBondContextResolver == address(0)) {
            revert AlterfordErrors.InvalidBondPolicy();
        }
        if (trustedForwarder == address(0)) revert AlterfordErrors.Unauthorized();
        bondPolicy = CreationBondPolicy(initialBondPolicy);
        bondContextResolver = CreationBondContextResolver(initialBondContextResolver);
        emit BondPolicyUpdated(address(0), initialBondPolicy);
        emit BondContextResolverUpdated(address(0), initialBondContextResolver);
    }

    function setBondContextResolver(address nextResolver) external onlyRole(GOVERNOR_ROLE) {
        if (nextResolver == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        address oldResolver = address(bondContextResolver);
        bondContextResolver = CreationBondContextResolver(nextResolver);
        emit BondContextResolverUpdated(oldResolver, nextResolver);
    }

    function setBondPolicy(address nextBondPolicy) external onlyRole(GOVERNOR_ROLE) {
        if (nextBondPolicy == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        address oldPolicy = address(bondPolicy);
        bondPolicy = CreationBondPolicy(nextBondPolicy);
        emit BondPolicyUpdated(oldPolicy, nextBondPolicy);
    }

    function setStandardResolutionWindow(uint64 nextWindow) external onlyRole(GOVERNOR_ROLE) {
        if (
            nextWindow < MIN_STANDARD_RESOLUTION_WINDOW
                || nextWindow > MAX_STANDARD_RESOLUTION_WINDOW
        ) revert AlterfordErrors.InvalidAmount();
        uint64 oldWindow = standardResolutionWindow;
        standardResolutionWindow = nextWindow;
        emit ResolutionWindowUpdated(oldWindow, nextWindow);
    }

    function createChallenge(
        address settlementToken,
        uint256 rewardPool,
        bytes32 rulesHash,
        string calldata metadataURI,
        uint256 deadline,
        bytes32 categoryId
    ) external nonReentrant whenNotPaused returns (uint256 challengeId) {
        return _createChallenge(
            settlementToken,
            rewardPool,
            rulesHash,
            metadataURI,
            deadline,
            categoryId,
            _actor(),
            _fundingModelFor(categoryId)
        );
    }

    function createChallengeWithPermit(
        address settlementToken,
        uint256 rewardPool,
        bytes32 rulesHash,
        string calldata metadataURI,
        uint256 deadline,
        bytes32 categoryId,
        PermitData calldata permitData
    ) external nonReentrant whenNotPaused returns (uint256 challengeId) {
        IERC20Permit(settlementToken)
            .permit(
                _actor(),
                address(this),
                permitData.value,
                permitData.deadline,
                permitData.v,
                permitData.r,
                permitData.s
            );
        return _createChallenge(
            settlementToken,
            rewardPool,
            rulesHash,
            metadataURI,
            deadline,
            categoryId,
            _actor(),
            _fundingModelFor(categoryId)
        );
    }

    function _createChallenge(
        address settlementToken,
        uint256 rewardPool,
        bytes32 rulesHash,
        string memory metadataURI,
        uint256 deadline,
        bytes32 categoryId,
        address creator,
        ChallengeFundingModel fundingModel
    ) private returns (uint256 challengeId) {
        if (settlementToken == address(0)) {
            revert AlterfordErrors.InvalidToken();
        }
        if (rewardPool == 0) revert AlterfordErrors.InvalidAmount();
        if (rulesHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        if (deadline <= block.timestamp) revert AlterfordErrors.InvalidAmount();
        CreationBondPolicy.BondContext memory bondContext = bondContextResolver.resolve(
            creator, AlterfordTypes.EntityType.Challenge, categoryId, rewardPool
        );
        uint256 maxDuration = _isHighRiskOrValue(rewardPool, bondContext.categoryRisk)
            ? HIGH_RISK_RESOLUTION_WINDOW
            : MAX_STANDARD_RESOLUTION_WINDOW;
        if (deadline > block.timestamp + maxDuration) {
            revert AlterfordErrors.ChallengeDurationTooLong();
        }

        (uint256 requiredBond, uint16 reasonFlags) = bondPolicy.previewBond(bondContext);
        challengeId = nextChallengeId++;

        Challenge storage challenge = challenges[challengeId];
        challenge.creator = creator;
        challenge.settlementToken = settlementToken;
        challenge.rulesHash = rulesHash;
        challenge.metadataURI = metadataURI;
        challenge.rewardPool = rewardPool;
        challenge.deadline = deadline;
        challenge.state = AlterfordTypes.ChallengeState.Open;
        challenge.categoryId = categoryId;
        challenge.mode = bondContext.mode;
        challenge.riskLevel = bondContext.categoryRisk;
        bondByChallenge[challengeId] = requiredBond;
        fundingModelByChallenge[challengeId] = fundingModel;
        bool rewardEscrowed = fundingModel == ChallengeFundingModel.Sponsored;
        rewardEscrowedByChallenge[challengeId] = rewardEscrowed;
        uint256 creationEscrow = requiredBond + (rewardEscrowed ? rewardPool : 0);
        if (!IERC20(settlementToken).transferFrom(creator, address(this), creationEscrow)) {
            revert AlterfordErrors.TransferFailed();
        }

        emit BondCalculated("Challenge", challengeId, creator, requiredBond, reasonFlags);
        emit BondLocked("Challenge", challengeId, creator, requiredBond);
        emit ChallengeCreated(
            challengeId,
            creator,
            rewardPool,
            rulesHash,
            categoryId,
            bondContext.mode,
            bondContext.categoryRisk
        );
        emit ChallengeFundingModelSelected(
            challengeId,
            fundingModel,
            fundingModel == ChallengeFundingModel.PerformerOffer ? creator : address(0),
            fundingModel == ChallengeFundingModel.Sponsored ? creator : address(0)
        );
    }

    function _fundingModelFor(bytes32 categoryId) private pure returns (ChallengeFundingModel) {
        return categoryId == VANILLA_PERFORMER_OFFER_CATEGORY
            || categoryId == UNDERWORLD_PERFORMER_OFFER_CATEGORY
            ? ChallengeFundingModel.PerformerOffer
            : ChallengeFundingModel.Sponsored;
    }

    function acceptChallenge(uint256 challengeId, string calldata liveStreamURI)
        external
        nonReentrant
        whenNotPaused
    {
        _acceptChallenge(challengeId, liveStreamURI, _actor());
    }

    function acceptChallengeWithPermit(
        uint256 challengeId,
        string calldata liveStreamURI,
        PermitData calldata permitData
    ) external nonReentrant whenNotPaused {
        Challenge storage challenge = challenges[challengeId];
        IERC20Permit(challenge.settlementToken)
            .permit(
                _actor(),
                address(this),
                permitData.value,
                permitData.deadline,
                permitData.v,
                permitData.r,
                permitData.s
            );
        _acceptChallenge(challengeId, liveStreamURI, _actor());
    }

    function _acceptChallenge(uint256 challengeId, string memory liveStreamURI, address executor)
        private
    {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Open) {
            revert AlterfordErrors.InvalidState();
        }
        if (challenge.creator == address(0)) revert AlterfordErrors.InvalidState();
        if (block.timestamp > challenge.deadline) revert AlterfordErrors.InvalidState();
        if (executor == challenge.creator) revert AlterfordErrors.InvalidState();

        ChallengeFundingModel fundingModel = fundingModelByChallenge[challengeId];
        uint256 executorBond =
            fundingModel == ChallengeFundingModel.Sponsored ? bondByChallenge[challengeId] : 0;
        uint256 acceptanceEscrow = fundingModel == ChallengeFundingModel.PerformerOffer
            ? challenge.rewardPool
            : executorBond;
        challenge.executor = executor;
        challenge.liveStreamURI = liveStreamURI;
        challenge.state = AlterfordTypes.ChallengeState.Accepted;
        executorBondByChallenge[challengeId] = executorBond;
        if (fundingModel == ChallengeFundingModel.PerformerOffer) {
            rewardEscrowedByChallenge[challengeId] = true;
        }

        if (!IERC20(challenge.settlementToken)
                .transferFrom(executor, address(this), acceptanceEscrow)) {
            revert AlterfordErrors.TransferFailed();
        }

        if (executorBond > 0) {
            emit BondLocked("ChallengeExecutor", challengeId, executor, executorBond);
        }
        if (fundingModel == ChallengeFundingModel.PerformerOffer) {
            emit ChallengeRewardFunded(challengeId, executor, challenge.rewardPool);
        }
        emit ChallengeAccepted(challengeId, executor, executorBond);
        if (bytes(liveStreamURI).length != 0) {
            emit ChallengeLiveStreamUpdated(challengeId, executor, liveStreamURI);
        }
    }

    function updateLiveStreamURI(uint256 challengeId, string calldata liveStreamURI)
        external
        whenNotPaused
    {
        Challenge storage challenge = challenges[challengeId];
        if (
            challenge.state != AlterfordTypes.ChallengeState.Accepted
                && challenge.state != AlterfordTypes.ChallengeState.EvidenceSubmitted
                && challenge.state != AlterfordTypes.ChallengeState.Review
        ) {
            revert AlterfordErrors.InvalidState();
        }
        if (_actor() != challenge.executor && _actor() != challenge.creator) {
            revert AlterfordErrors.Unauthorized();
        }
        challenge.liveStreamURI = liveStreamURI;
        emit ChallengeLiveStreamUpdated(challengeId, _actor(), liveStreamURI);
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
        if (_actor() != performerOf(challengeId)) revert AlterfordErrors.Unauthorized();
        if (evidenceHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        if (block.timestamp > challenge.deadline) revert AlterfordErrors.InvalidState();

        challenge.evidenceHash = evidenceHash;
        challenge.evidenceURI = evidenceURI;
        challenge.liveStreamURI = liveStreamURI;
        challenge.state = AlterfordTypes.ChallengeState.EvidenceSubmitted;

        emit ChallengeEvidenceSubmitted(
            challengeId, _actor(), evidenceHash, evidenceURI, liveStreamURI
        );
        if (bytes(liveStreamURI).length != 0) {
            emit ChallengeLiveStreamUpdated(challengeId, _actor(), liveStreamURI);
        }
    }

    function proposeResolution(uint256 challengeId, bool executorSucceeded, bytes32 evidenceHash)
        external
        whenNotPaused
    {
        Challenge storage challenge = challenges[challengeId];
        if (
            challenge.state != AlterfordTypes.ChallengeState.Accepted
                && challenge.state != AlterfordTypes.ChallengeState.EvidenceSubmitted
        ) revert AlterfordErrors.InvalidState();
        if (_actor() != challenge.creator && _actor() != challenge.executor) {
            revert AlterfordErrors.Unauthorized();
        }
        if (resolutionProposalByChallenge[challengeId].proposer != address(0)) {
            revert AlterfordErrors.ResolutionAlreadyProposed();
        }
        if (executorSucceeded && evidenceHash == bytes32(0) && challenge.evidenceHash == bytes32(0))
        {
            revert AlterfordErrors.InvalidMetadataHash();
        }

        uint64 disputeDeadline = uint64(block.timestamp + resolutionWindowFor(challengeId));
        resolutionProposalByChallenge[challengeId] = ResolutionProposal({
            proposer: _actor(),
            executorSucceeded: executorSucceeded,
            evidenceHash: evidenceHash == bytes32(0) ? challenge.evidenceHash : evidenceHash,
            proposedAt: uint64(block.timestamp),
            disputeDeadline: disputeDeadline
        });
        challenge.state = AlterfordTypes.ChallengeState.Review;
        emit ChallengeResolutionProposed(
            challengeId, _actor(), executorSucceeded, evidenceHash, disputeDeadline
        );
    }

    function confirmResolution(uint256 challengeId, bool executorSucceeded)
        external
        nonReentrant
        whenNotPaused
    {
        Challenge storage challenge = challenges[challengeId];
        ResolutionProposal storage proposal = resolutionProposalByChallenge[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Review) {
            revert AlterfordErrors.InvalidState();
        }
        if (proposal.proposer == address(0)) revert AlterfordErrors.ResolutionNotProposed();
        if (
            (_actor() != challenge.creator && _actor() != challenge.executor)
                || _actor() == proposal.proposer
        ) revert AlterfordErrors.Unauthorized();
        if (executorSucceeded != proposal.executorSucceeded) {
            revert AlterfordErrors.ResolutionMismatch();
        }

        emit ChallengeResolutionConfirmed(challengeId, _actor(), executorSucceeded);
        _finalizeResolution(
            challengeId,
            challenge,
            executorSucceeded,
            false,
            !executorSucceeded,
            keccak256("MUTUAL_CONFIRMATION")
        );
    }

    function disputeResolution(uint256 challengeId, bytes32 reasonHash)
        external
        nonReentrant
        whenNotPaused
    {
        Challenge storage challenge = challenges[challengeId];
        ResolutionProposal storage proposal = resolutionProposalByChallenge[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Review) {
            revert AlterfordErrors.InvalidState();
        }
        if (proposal.proposer == address(0)) revert AlterfordErrors.ResolutionNotProposed();
        if (block.timestamp > proposal.disputeDeadline) {
            revert AlterfordErrors.DisputeWindowExpired();
        }
        if (disputantByChallenge[challengeId] != address(0)) {
            revert AlterfordErrors.DisputeAlreadyOpened();
        }
        if (
            _actor() != challenge.creator && _actor() != challenge.executor
                && !hasRole[WATCHER_ROLE][_actor()]
        ) revert AlterfordErrors.Unauthorized();
        if (reasonHash == bytes32(0)) revert AlterfordErrors.InvalidIncidentHash();

        uint256 bondAmount = disputeBondFor(challengeId);
        disputantByChallenge[challengeId] = _actor();
        disputeBondByChallenge[challengeId] = bondAmount;
        challenge.state = AlterfordTypes.ChallengeState.Disputed;
        if (!IERC20(challenge.settlementToken).transferFrom(_actor(), address(this), bondAmount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondLocked("ChallengeDispute", challengeId, _actor(), bondAmount);
        emit ChallengeResolutionDisputed(challengeId, _actor(), bondAmount, reasonHash);
    }

    function finalizeUndisputed(uint256 challengeId) external nonReentrant whenNotPaused {
        Challenge storage challenge = challenges[challengeId];
        ResolutionProposal storage proposal = resolutionProposalByChallenge[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Review) {
            revert AlterfordErrors.InvalidState();
        }
        if (proposal.proposer == address(0)) revert AlterfordErrors.ResolutionNotProposed();
        if (block.timestamp <= proposal.disputeDeadline) {
            revert AlterfordErrors.DisputeWindowActive();
        }
        _finalizeResolution(
            challengeId,
            challenge,
            proposal.executorSucceeded,
            false,
            !proposal.executorSucceeded,
            keccak256("UNDISPUTED_FINALIZATION")
        );
    }

    function resolveDispute(uint256 challengeId, bool executorSucceeded, bytes32 reasonHash)
        external
        nonReentrant
        onlyRole(ARBITER_ROLE)
    {
        Challenge storage challenge = challenges[challengeId];
        ResolutionProposal storage proposal = resolutionProposalByChallenge[challengeId];
        if (challenge.state != AlterfordTypes.ChallengeState.Disputed) {
            revert AlterfordErrors.InvalidState();
        }
        if (reasonHash == bytes32(0)) revert AlterfordErrors.InvalidIncidentHash();

        bool disputeSucceeded = executorSucceeded != proposal.executorSucceeded;
        _finalizeResolution(
            challengeId, challenge, executorSucceeded, false, !executorSucceeded, reasonHash
        );
        _finalizeDisputeBond(
            challengeId, challenge, disputeSucceeded, executorSucceeded, reasonHash
        );
        emit ChallengeDisputeResolved(challengeId, executorSucceeded, disputeSucceeded, reasonHash);
    }

    function resolveEarly(uint256 challengeId, bool executorSucceeded, bytes32 reasonHash)
        external
        nonReentrant
        onlyRole(ARBITER_ROLE)
    {
        Challenge storage challenge = challenges[challengeId];
        if (
            challenge.state != AlterfordTypes.ChallengeState.Accepted
                && challenge.state != AlterfordTypes.ChallengeState.EvidenceSubmitted
                && challenge.state != AlterfordTypes.ChallengeState.Review
        ) revert AlterfordErrors.InvalidState();
        if (reasonHash == bytes32(0)) revert AlterfordErrors.InvalidIncidentHash();
        emit ChallengeResolvedEarly(challengeId, executorSucceeded, reasonHash);
        _finalizeResolution(
            challengeId, challenge, executorSucceeded, false, !executorSucceeded, reasonHash
        );
    }

    function resolutionWindowFor(uint256 challengeId) public view returns (uint64) {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.creator == address(0)) revert AlterfordErrors.InvalidState();
        return _isHighRiskOrValue(challenge.rewardPool, challenge.riskLevel)
            ? HIGH_RISK_RESOLUTION_WINDOW
            : standardResolutionWindow;
    }

    function sponsorOf(uint256 challengeId) public view returns (address) {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.creator == address(0)) revert AlterfordErrors.InvalidState();
        return fundingModelByChallenge[challengeId] == ChallengeFundingModel.PerformerOffer
            ? challenge.executor
            : challenge.creator;
    }

    function performerOf(uint256 challengeId) public view returns (address) {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.creator == address(0)) revert AlterfordErrors.InvalidState();
        return fundingModelByChallenge[challengeId] == ChallengeFundingModel.PerformerOffer
            ? challenge.creator
            : challenge.executor;
    }

    function disputeBondFor(uint256 challengeId) public view returns (uint256) {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.creator == address(0)) revert AlterfordErrors.InvalidState();
        uint256 amount = (challenge.rewardPool * 200) / AlterfordTypes.BPS_DENOMINATOR;
        if (amount < MIN_DISPUTE_BOND) return MIN_DISPUTE_BOND;
        if (amount > MAX_DISPUTE_BOND) return MAX_DISPUTE_BOND;
        return amount;
    }

    function resolveChallenge(
        uint256 challengeId,
        bool executorSucceeded,
        bool slashCreatorBond,
        bool slashExecutorBond,
        bytes32 reasonHash
    ) external nonReentrant onlyRole(ARBITER_ROLE) {
        Challenge storage challenge = challenges[challengeId];
        if (
            challenge.state != AlterfordTypes.ChallengeState.Accepted
                && challenge.state != AlterfordTypes.ChallengeState.EvidenceSubmitted
                && challenge.state != AlterfordTypes.ChallengeState.Review
        ) revert AlterfordErrors.InvalidState();
        _finalizeResolution(
            challengeId,
            challenge,
            executorSucceeded,
            slashCreatorBond,
            slashExecutorBond,
            reasonHash
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
                && challenge.state != AlterfordTypes.ChallengeState.Review
                && challenge.state != AlterfordTypes.ChallengeState.Disputed
        ) revert AlterfordErrors.InvalidState();
        if (rewardFinalized[challengeId]) revert AlterfordErrors.AlreadyClaimed();

        challenge.state = AlterfordTypes.ChallengeState.Cancelled;
        rewardFinalized[challengeId] = true;

        if (rewardEscrowedByChallenge[challengeId]) {
            rewardEscrowedByChallenge[challengeId] = false;
            if (!IERC20(challenge.settlementToken)
                    .transfer(sponsorOf(challengeId), challenge.rewardPool)) {
                revert AlterfordErrors.TransferFailed();
            }
        }
        _finalizeCreatorBond(challengeId, challenge, false, reasonHash);
        _finalizeExecutorBond(challengeId, challenge, false, reasonHash);
        _returnDisputeBond(challengeId, challenge);

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
                && challenge.state != AlterfordTypes.ChallengeState.Review
                && challenge.state != AlterfordTypes.ChallengeState.Disputed
        ) revert AlterfordErrors.InvalidState();
        if (offender != challenge.creator && offender != challenge.executor) {
            revert AlterfordErrors.InvalidState();
        }

        challenge.state = AlterfordTypes.ChallengeState.Fraud;
        if (!rewardFinalized[challengeId]) {
            rewardFinalized[challengeId] = true;
            if (rewardEscrowedByChallenge[challengeId]) {
                rewardEscrowedByChallenge[challengeId] = false;
                if (!IERC20(challenge.settlementToken)
                        .transfer(sponsorOf(challengeId), challenge.rewardPool)) {
                    revert AlterfordErrors.TransferFailed();
                }
            }
        }

        _finalizeCreatorBond(challengeId, challenge, offender == challenge.creator, reasonHash);
        _finalizeExecutorBond(challengeId, challenge, offender == challenge.executor, reasonHash);
        _returnDisputeBond(challengeId, challenge);

        emit ChallengeFraudConfirmed(challengeId, offender, reasonHash);
    }

    function _finalizeResolution(
        uint256 challengeId,
        Challenge storage challenge,
        bool executorSucceeded,
        bool slashCreatorBond,
        bool slashExecutorBond,
        bytes32 reasonHash
    ) private {
        if (rewardFinalized[challengeId]) {
            revert AlterfordErrors.AlreadyClaimed();
        }
        if (!rewardEscrowedByChallenge[challengeId]) revert AlterfordErrors.InvalidState();

        challenge.state = AlterfordTypes.ChallengeState.Resolved;
        rewardFinalized[challengeId] = true;
        rewardEscrowedByChallenge[challengeId] = false;

        uint256 rewardPayout = 0;
        uint256 adminFee = 0;
        uint256 creatorFee = 0;
        if (executorSucceeded) {
            (rewardPayout, adminFee, creatorFee) = _settleReward(challengeId, challenge);
        } else if (!IERC20(challenge.settlementToken)
                .transfer(sponsorOf(challengeId), challenge.rewardPool)) {
            revert AlterfordErrors.TransferFailed();
        }

        _finalizeCreatorBond(challengeId, challenge, slashCreatorBond, reasonHash);
        _finalizeExecutorBond(challengeId, challenge, slashExecutorBond, reasonHash);

        address winner = executorSucceeded ? performerOf(challengeId) : sponsorOf(challengeId);
        emit ChallengeResolved(
            challengeId, winner, executorSucceeded, rewardPayout, adminFee, creatorFee
        );
    }

    function _finalizeDisputeBond(
        uint256 challengeId,
        Challenge storage challenge,
        bool disputeSucceeded,
        bool executorSucceeded,
        bytes32 reasonHash
    ) private {
        uint256 amount = disputeBondByChallenge[challengeId];
        address disputant = disputantByChallenge[challengeId];
        disputeBondByChallenge[challengeId] = 0;
        if (amount == 0 || disputant == address(0)) return;

        if (disputeSucceeded) {
            if (!IERC20(challenge.settlementToken).transfer(disputant, amount)) {
                revert AlterfordErrors.TransferFailed();
            }
            emit BondReleased("ChallengeDispute", challengeId, disputant, amount);
            return;
        }

        address beneficiary = executorSucceeded ? performerOf(challengeId) : sponsorOf(challengeId);
        if (!IERC20(challenge.settlementToken).transfer(beneficiary, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondSlashed("ChallengeDispute", challengeId, amount, reasonHash);
    }

    function _returnDisputeBond(uint256 challengeId, Challenge storage challenge) private {
        uint256 amount = disputeBondByChallenge[challengeId];
        address disputant = disputantByChallenge[challengeId];
        disputeBondByChallenge[challengeId] = 0;
        if (amount == 0 || disputant == address(0)) return;
        if (!IERC20(challenge.settlementToken).transfer(disputant, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondReleased("ChallengeDispute", challengeId, disputant, amount);
    }

    function _isHighRiskOrValue(uint256 rewardPool, AlterfordTypes.RiskLevel risk)
        private
        pure
        returns (bool)
    {
        return rewardPool >= HIGH_VALUE_THRESHOLD || risk >= AlterfordTypes.RiskLevel.High;
    }

    function _settleReward(uint256 challengeId, Challenge storage challenge)
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
        if (!IERC20(challenge.settlementToken).transfer(performerOf(challengeId), rewardPayout)) {
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

    function _actor() internal view override returns (address) {
        return _msgSender();
    }
}
