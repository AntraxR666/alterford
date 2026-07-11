// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";

contract ModerationCouncil is Governed {
    struct ModerationCase {
        bytes32 entityType;
        uint256 entityId;
        AlterfordTypes.ModerationStatus status;
        bytes32 reasonHash;
        uint64 openedAt;
    }

    uint256 public nextCaseId = 1;
    mapping(uint256 => ModerationCase) public casesById;
    mapping(bytes32 => AlterfordTypes.ModerationStatus) public statusByEntityKey;

    event ContentFlagged(
        uint256 indexed caseId,
        bytes32 indexed entityType,
        uint256 indexed entityId,
        bytes32 reasonHash
    );
    event ContentHidden(bytes32 indexed entityType, uint256 indexed entityId, bytes32 reasonHash);
    event ModerationDecisionSubmitted(
        uint256 indexed caseId, AlterfordTypes.ModerationStatus status, bytes32 reasonHash
    );
    event ContentCleared(bytes32 indexed entityType, uint256 indexed entityId);
    event ViolationConfirmed(
        bytes32 indexed entityType, uint256 indexed entityId, bytes32 reasonHash
    );

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function flagContent(bytes32 entityType, uint256 entityId, bytes32 reasonHash)
        external
        whenNotPaused
        returns (uint256 caseId)
    {
        caseId = nextCaseId++;
        casesById[caseId] = ModerationCase({
            entityType: entityType,
            entityId: entityId,
            status: AlterfordTypes.ModerationStatus.Flagged,
            reasonHash: reasonHash,
            openedAt: uint64(block.timestamp)
        });
        statusByEntityKey[_entityKey(entityType, entityId)] =
        AlterfordTypes.ModerationStatus.Flagged;
        emit ContentFlagged(caseId, entityType, entityId, reasonHash);
    }

    function submitDecision(
        uint256 caseId,
        AlterfordTypes.ModerationStatus status,
        bytes32 reasonHash
    ) external onlyRole(ARBITER_ROLE) {
        ModerationCase storage moderationCase = casesById[caseId];
        moderationCase.status = status;
        moderationCase.reasonHash = reasonHash;
        statusByEntityKey[_entityKey(moderationCase.entityType, moderationCase.entityId)] = status;
        emit ModerationDecisionSubmitted(caseId, status, reasonHash);
        if (status == AlterfordTypes.ModerationStatus.Hidden) {
            emit ContentHidden(moderationCase.entityType, moderationCase.entityId, reasonHash);
        }
        if (status == AlterfordTypes.ModerationStatus.Cleared) {
            emit ContentCleared(moderationCase.entityType, moderationCase.entityId);
        }
        if (status == AlterfordTypes.ModerationStatus.ConfirmedViolation) {
            emit ViolationConfirmed(moderationCase.entityType, moderationCase.entityId, reasonHash);
        }
    }

    function _entityKey(bytes32 entityType, uint256 entityId) private pure returns (bytes32) {
        return keccak256(abi.encode(entityType, entityId));
    }
}
