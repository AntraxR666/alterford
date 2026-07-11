// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { ReentrancyGuardLite } from "../security/ReentrancyGuardLite.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { CreationBondPolicy } from "../bonds/CreationBondPolicy.sol";
import { IERC20 } from "../token/IERC20.sol";

contract BountyFactory is Governed, ReentrancyGuardLite {
    struct Bounty {
        address creator;
        address settlementToken;
        uint256 rewardPool;
        uint256 deadline;
        bytes32 rulesHash;
        string metadataURI;
        AlterfordTypes.BountyState state;
    }

    uint256 public nextBountyId = 1;
    CreationBondPolicy public bondPolicy;
    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => mapping(address => bytes32)) public submissionHashByUser;
    mapping(uint256 => uint256) public bondByBounty;
    mapping(uint256 => bool) public bondFinalized;

    event BountyCreated(
        uint256 indexed bountyId, address indexed creator, uint256 rewardPool, bytes32 rulesHash
    );
    event SubmissionCreated(
        uint256 indexed bountyId, address indexed submitter, bytes32 submissionHash
    );
    event BountyResolved(uint256 indexed bountyId, address[] winners);
    event BountyCancelled(uint256 indexed bountyId, bytes32 reasonHash);
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

    function createBounty(
        address settlementToken,
        uint256 rewardPool,
        uint256 deadline,
        bytes32 rulesHash,
        string calldata metadataURI,
        CreationBondPolicy.BondContext calldata bondContext
    ) external nonReentrant whenNotPaused returns (uint256 bountyId) {
        if (settlementToken == address(0)) {
            revert AlterfordErrors.InvalidToken();
        }
        if (rewardPool == 0) revert AlterfordErrors.InvalidAmount();
        if (deadline <= block.timestamp) revert AlterfordErrors.InvalidAmount();
        if (rulesHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        if (bondContext.entityType != AlterfordTypes.EntityType.Bounty) {
            revert AlterfordErrors.InvalidBondPolicy();
        }

        (uint256 requiredBond, uint16 reasonFlags) = bondPolicy.previewBond(bondContext);
        bountyId = nextBountyId++;

        bounties[bountyId] = Bounty({
            creator: msg.sender,
            settlementToken: settlementToken,
            rewardPool: rewardPool,
            deadline: deadline,
            rulesHash: rulesHash,
            metadataURI: metadataURI,
            state: AlterfordTypes.BountyState.Open
        });

        bondByBounty[bountyId] = requiredBond;
        if (!IERC20(settlementToken).transferFrom(msg.sender, address(this), requiredBond)) {
            revert AlterfordErrors.TransferFailed();
        }

        emit BondCalculated("Bounty", bountyId, msg.sender, requiredBond, reasonFlags);
        emit BondLocked("Bounty", bountyId, msg.sender, requiredBond);
        emit BountyCreated(bountyId, msg.sender, rewardPool, rulesHash);
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
        Bounty storage bounty = bounties[bountyId];
        if (bounty.state != AlterfordTypes.BountyState.Open) revert AlterfordErrors.InvalidState();
        if (block.timestamp > bounty.deadline) revert AlterfordErrors.InvalidState();
        if (submissionHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        submissionHashByUser[bountyId][msg.sender] = submissionHash;
        emit SubmissionCreated(bountyId, msg.sender, submissionHash);
    }

    function resolveBounty(uint256 bountyId, address[] calldata winners)
        external
        onlyRole(RESOLVER_ROLE)
    {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.state != AlterfordTypes.BountyState.Open) revert AlterfordErrors.InvalidState();
        bounty.state = AlterfordTypes.BountyState.Resolved;
        emit BountyResolved(bountyId, winners);
    }
}
