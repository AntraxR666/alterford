// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { ReentrancyGuardLite } from "../security/ReentrancyGuardLite.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { CreationBondPolicy } from "../bonds/CreationBondPolicy.sol";
import { CreationBondContextResolver } from "../bonds/CreationBondContextResolver.sol";
import { IERC20 } from "../token/IERC20.sol";

interface IBountyRecoveryVault {
    function SECURITY_ADMIN_ROLE() external view returns (bytes32);
    function hasRole(bytes32 role, address account) external view returns (bool);
}

contract BountyFactory is Governed, ReentrancyGuardLite {
    uint256 public constant MAX_BOUNTY_WINNERS = 100;

    struct Bounty {
        address creator;
        address settlementToken;
        uint256 rewardPool;
        uint256 deadline;
        bytes32 rulesHash;
        string metadataURI;
        AlterfordTypes.BountyState state;
        bytes32 categoryId;
        AlterfordTypes.Mode mode;
        AlterfordTypes.RiskLevel riskLevel;
    }

    uint256 public nextBountyId = 1;
    CreationBondPolicy public bondPolicy;
    CreationBondContextResolver public bondContextResolver;
    address public recoveryVault;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => mapping(address => bytes32)) public submissionHashByUser;
    mapping(uint256 => mapping(address => string)) public submissionURIByUser;
    mapping(uint256 => uint256) public bondByBounty;
    mapping(uint256 => bool) public bondFinalized;
    mapping(uint256 => uint256) public rewardEscrowByBounty;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed creator,
        uint256 rewardPool,
        bytes32 rulesHash,
        bytes32 categoryId,
        AlterfordTypes.Mode mode,
        AlterfordTypes.RiskLevel riskLevel
    );
    event SubmissionCreated(
        uint256 indexed bountyId, address indexed submitter, bytes32 submissionHash
    );
    event SubmissionEvidenceCreated(
        uint256 indexed bountyId,
        address indexed submitter,
        bytes32 submissionHash,
        string evidenceURI
    );
    event BountyResolved(uint256 indexed bountyId, address[] winners, uint256[] amounts);
    event BountyCancelled(uint256 indexed bountyId, bytes32 reasonHash);
    event RecoveryVaultUpdated(address indexed oldVault, address indexed newVault);
    event EmergencyBountyRecovered(
        uint256 indexed bountyId,
        address indexed token,
        address indexed recoveryVault,
        uint256 rewardAmount,
        uint256 bondAmount,
        bytes32 incidentHash,
        address securityAdmin
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

    constructor(address initialAdmin, address initialBondPolicy, address initialBondContextResolver)
        Governed(initialAdmin)
    {
        if (initialBondPolicy == address(0) || initialBondContextResolver == address(0)) {
            revert AlterfordErrors.InvalidBondPolicy();
        }
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

    function setRecoveryVault(address nextRecoveryVault) external onlyRole(GOVERNOR_ROLE) {
        if (nextRecoveryVault == address(0)) revert AlterfordErrors.InvalidToken();
        if (recoveryVault != address(0) && !paused) revert AlterfordErrors.InvalidState();
        address oldVault = recoveryVault;
        recoveryVault = nextRecoveryVault;
        emit RecoveryVaultUpdated(oldVault, nextRecoveryVault);
    }

    function createBounty(
        address settlementToken,
        uint256 rewardPool,
        uint256 deadline,
        bytes32 rulesHash,
        string calldata metadataURI,
        bytes32 categoryId
    ) external nonReentrant whenNotPaused returns (uint256 bountyId) {
        if (settlementToken == address(0)) {
            revert AlterfordErrors.InvalidToken();
        }
        if (rewardPool == 0) revert AlterfordErrors.InvalidAmount();
        if (deadline <= block.timestamp) revert AlterfordErrors.InvalidAmount();
        if (rulesHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        CreationBondPolicy.BondContext memory bondContext = bondContextResolver.resolve(
            msg.sender, AlterfordTypes.EntityType.Bounty, categoryId, rewardPool
        );
        (uint256 requiredBond, uint16 reasonFlags) = bondPolicy.previewBond(bondContext);
        bountyId = nextBountyId++;

        bounties[bountyId] = Bounty({
            creator: msg.sender,
            settlementToken: settlementToken,
            rewardPool: rewardPool,
            deadline: deadline,
            rulesHash: rulesHash,
            metadataURI: metadataURI,
            state: AlterfordTypes.BountyState.Open,
            categoryId: categoryId,
            mode: bondContext.mode,
            riskLevel: bondContext.categoryRisk
        });

        bondByBounty[bountyId] = requiredBond;
        rewardEscrowByBounty[bountyId] = rewardPool;
        if (!IERC20(settlementToken)
                .transferFrom(msg.sender, address(this), requiredBond + rewardPool)) {
            revert AlterfordErrors.TransferFailed();
        }

        emit BondCalculated("Bounty", bountyId, msg.sender, requiredBond, reasonFlags);
        emit BondLocked("Bounty", bountyId, msg.sender, requiredBond);
        emit BountyCreated(
            bountyId,
            msg.sender,
            rewardPool,
            rulesHash,
            categoryId,
            bondContext.mode,
            bondContext.categoryRisk
        );
    }

    function releaseBond(uint256 bountyId) external nonReentrant onlyRole(GOVERNOR_ROLE) {
        if (bondFinalized[bountyId]) revert AlterfordErrors.BondAlreadyFinalized();
        uint256 amount = bondByBounty[bountyId];
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        Bounty storage bounty = bounties[bountyId];
        bondFinalized[bountyId] = true;
        bondByBounty[bountyId] = 0;
        if (!IERC20(bounty.settlementToken).transfer(bounty.creator, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondReleased("Bounty", bountyId, bounty.creator, amount);
    }

    function slashBond(uint256 bountyId, bytes32 reasonHash) external onlyRole(ARBITER_ROLE) {
        if (bondFinalized[bountyId]) revert AlterfordErrors.BondAlreadyFinalized();
        uint256 amount = bondByBounty[bountyId];
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        bondFinalized[bountyId] = true;
        bondByBounty[bountyId] = 0;
        emit BondSlashed("Bounty", bountyId, amount, reasonHash);
    }

    function submit(uint256 bountyId, bytes32 submissionHash) external whenNotPaused {
        _recordSubmission(bountyId, submissionHash);
    }

    function submitEvidence(uint256 bountyId, bytes32 submissionHash, string calldata evidenceURI)
        external
        whenNotPaused
    {
        if (
            bytes(evidenceURI).length == 0 || submissionHash == bytes32(0)
                || keccak256(bytes(evidenceURI)) != submissionHash
        ) revert AlterfordErrors.InvalidMetadataHash();
        _recordSubmission(bountyId, submissionHash);
        submissionURIByUser[bountyId][msg.sender] = evidenceURI;
        emit SubmissionEvidenceCreated(bountyId, msg.sender, submissionHash, evidenceURI);
    }

    function _recordSubmission(uint256 bountyId, bytes32 submissionHash) private {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.state != AlterfordTypes.BountyState.Open) revert AlterfordErrors.InvalidState();
        if (block.timestamp > bounty.deadline) revert AlterfordErrors.InvalidState();
        if (submissionHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        submissionHashByUser[bountyId][msg.sender] = submissionHash;
        emit SubmissionCreated(bountyId, msg.sender, submissionHash);
    }

    function resolveBounty(uint256 bountyId, address[] calldata winners, uint256[] calldata amounts)
        external
        nonReentrant
        onlyRole(RESOLVER_ROLE)
    {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.state != AlterfordTypes.BountyState.Open) revert AlterfordErrors.InvalidState();
        if (winners.length == 0 || winners.length != amounts.length) {
            revert AlterfordErrors.InvalidAmount();
        }
        if (winners.length > MAX_BOUNTY_WINNERS) {
            revert AlterfordErrors.TooManyRecipients();
        }

        uint256 totalPayout = 0;
        // Winner fan-out is bounded above, so settlement cannot grow without limit.
        // slither-disable-next-line calls-loop
        for (uint256 i = 0; i < winners.length; i++) {
            if (
                winners[i] == address(0) || submissionHashByUser[bountyId][winners[i]] == bytes32(0)
                    || amounts[i] == 0
            ) revert AlterfordErrors.InvalidAmount();
            for (uint256 j = 0; j < i; j++) {
                if (winners[i] == winners[j]) revert AlterfordErrors.DuplicateRecipient();
            }
            totalPayout += amounts[i];
        }
        if (totalPayout != rewardEscrowByBounty[bountyId]) {
            revert AlterfordErrors.InsufficientEscrow();
        }

        bounty.state = AlterfordTypes.BountyState.Resolved;
        rewardEscrowByBounty[bountyId] = 0;
        for (uint256 i = 0; i < winners.length; i++) {
            // slither-disable-next-line calls-loop
            if (!IERC20(bounty.settlementToken).transfer(winners[i], amounts[i])) {
                revert AlterfordErrors.TransferFailed();
            }
        }
        _releaseBond(bountyId, bounty);
        emit BountyResolved(bountyId, winners, amounts);
    }

    function cancelBounty(uint256 bountyId, bytes32 reasonHash)
        external
        nonReentrant
        onlyRole(ARBITER_ROLE)
    {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.state != AlterfordTypes.BountyState.Open) revert AlterfordErrors.InvalidState();

        bounty.state = AlterfordTypes.BountyState.Cancelled;
        uint256 rewardAmount = rewardEscrowByBounty[bountyId];
        rewardEscrowByBounty[bountyId] = 0;
        if (
            rewardAmount > 0
                && !IERC20(bounty.settlementToken).transfer(bounty.creator, rewardAmount)
        ) revert AlterfordErrors.TransferFailed();
        _releaseBond(bountyId, bounty);
        emit BountyCancelled(bountyId, reasonHash);
    }

    function emergencyRecoverBounty(uint256 bountyId, bytes32 incidentHash) external nonReentrant {
        if (!paused) revert AlterfordErrors.InvalidState();
        if (incidentHash == bytes32(0)) revert AlterfordErrors.InvalidIncidentHash();
        address vault = recoveryVault;
        if (vault == address(0)) revert AlterfordErrors.RecoveryVaultNotConfigured();
        bytes32 securityRole = IBountyRecoveryVault(vault).SECURITY_ADMIN_ROLE();
        if (!IBountyRecoveryVault(vault).hasRole(securityRole, msg.sender)) {
            revert AlterfordErrors.Unauthorized();
        }

        Bounty storage bounty = bounties[bountyId];
        if (
            bounty.creator == address(0) || bounty.state == AlterfordTypes.BountyState.Resolved
                || bounty.state == AlterfordTypes.BountyState.Cancelled
                || bounty.state == AlterfordTypes.BountyState.EmergencyRecovered
        ) revert AlterfordErrors.EscrowAlreadyRecovered();

        uint256 rewardAmount = rewardEscrowByBounty[bountyId];
        uint256 bondAmount = bondFinalized[bountyId] ? 0 : bondByBounty[bountyId];
        uint256 totalRecovery = rewardAmount + bondAmount;
        if (totalRecovery == 0) revert AlterfordErrors.NothingToClaim();

        bounty.state = AlterfordTypes.BountyState.EmergencyRecovered;
        rewardEscrowByBounty[bountyId] = 0;
        if (bondAmount > 0) {
            bondFinalized[bountyId] = true;
            bondByBounty[bountyId] = 0;
        }
        if (!IERC20(bounty.settlementToken).transfer(vault, totalRecovery)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit EmergencyBountyRecovered(
            bountyId,
            bounty.settlementToken,
            vault,
            rewardAmount,
            bondAmount,
            incidentHash,
            msg.sender
        );
    }

    function _releaseBond(uint256 bountyId, Bounty storage bounty) private {
        if (bondFinalized[bountyId]) return;
        uint256 amount = bondByBounty[bountyId];
        bondFinalized[bountyId] = true;
        bondByBounty[bountyId] = 0;
        if (amount == 0) return;
        if (!IERC20(bounty.settlementToken).transfer(bounty.creator, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondReleased("Bounty", bountyId, bounty.creator, amount);
    }
}
