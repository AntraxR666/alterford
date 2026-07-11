// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract ReputationEngine is Governed {
    uint16 public constant MAX_SCORE = 10_000;

    struct Reputation {
        uint16 creatorQualityScore;
        uint16 userTrustScore;
        uint16 resolverReliabilityScore;
        uint16 sybilRiskScore;
        uint16 marketIntegrityScore;
        uint64 lastUpdated;
    }

    mapping(address => Reputation) public reputationOf;
    mapping(uint256 => bytes32) public snapshotRoot;

    event ReputationUpdated(
        address indexed subject,
        bytes32 indexed scoreType,
        uint16 oldScore,
        uint16 newScore,
        bytes32 reasonHash
    );
    event ReputationSnapshotPublished(
        uint256 indexed snapshotId, bytes32 merkleRoot, string period
    );
    event ReputationPenaltyApplied(
        address indexed subject, bytes32 penaltyType, bytes32 reasonHash
    );
    event ReputationBoostApplied(address indexed subject, bytes32 boostType, bytes32 reasonHash);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function updateScores(address subject, Reputation calldata next, bytes32 reasonHash)
        external
        onlyRole(MODULE_ROLE)
    {
        _assertScore(next.creatorQualityScore);
        _assertScore(next.userTrustScore);
        _assertScore(next.resolverReliabilityScore);
        _assertScore(next.sybilRiskScore);
        _assertScore(next.marketIntegrityScore);
        Reputation storage current = reputationOf[subject];
        emit ReputationUpdated(
            subject,
            "creatorQualityScore",
            current.creatorQualityScore,
            next.creatorQualityScore,
            reasonHash
        );
        emit ReputationUpdated(
            subject, "userTrustScore", current.userTrustScore, next.userTrustScore, reasonHash
        );
        current.creatorQualityScore = next.creatorQualityScore;
        current.userTrustScore = next.userTrustScore;
        current.resolverReliabilityScore = next.resolverReliabilityScore;
        current.sybilRiskScore = next.sybilRiskScore;
        current.marketIntegrityScore = next.marketIntegrityScore;
        current.lastUpdated = uint64(block.timestamp);
    }

    function publishSnapshot(uint256 snapshotId, bytes32 merkleRoot, string calldata period)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        if (merkleRoot == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        snapshotRoot[snapshotId] = merkleRoot;
        emit ReputationSnapshotPublished(snapshotId, merkleRoot, period);
    }

    function _assertScore(uint16 score) private pure {
        if (score > MAX_SCORE) revert AlterfordErrors.InvalidAmount();
    }
}
