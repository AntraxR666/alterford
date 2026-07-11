// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract EvidenceVault is Governed {
    struct Evidence {
        bytes32 entityType;
        uint256 entityId;
        bytes32 evidenceHash;
        string uri;
        address submitter;
        uint64 submittedAt;
        bool flagged;
    }

    uint256 public nextEvidenceId = 1;
    mapping(uint256 => Evidence) public evidenceById;

    event EvidenceSubmitted(
        bytes32 indexed entityType,
        uint256 indexed entityId,
        uint256 indexed evidenceId,
        bytes32 evidenceHash,
        string uri
    );
    event EvidenceFlagged(uint256 indexed evidenceId, bytes32 reasonHash);
    event EvidenceLinked(uint256 indexed parentEvidenceId, uint256 indexed childEvidenceId);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function submitEvidence(
        bytes32 entityType,
        uint256 entityId,
        bytes32 evidenceHash,
        string calldata uri
    ) external whenNotPaused returns (uint256 evidenceId) {
        if (entityType == bytes32(0) || evidenceHash == bytes32(0)) {
            revert AlterfordErrors.InvalidMetadataHash();
        }
        evidenceId = nextEvidenceId++;
        evidenceById[evidenceId] = Evidence({
            entityType: entityType,
            entityId: entityId,
            evidenceHash: evidenceHash,
            uri: uri,
            submitter: msg.sender,
            submittedAt: uint64(block.timestamp),
            flagged: false
        });
        emit EvidenceSubmitted(entityType, entityId, evidenceId, evidenceHash, uri);
    }

    function flagEvidence(uint256 evidenceId, bytes32 reasonHash) external onlyRole(ARBITER_ROLE) {
        evidenceById[evidenceId].flagged = true;
        emit EvidenceFlagged(evidenceId, reasonHash);
    }

    function linkEvidence(uint256 parentEvidenceId, uint256 childEvidenceId)
        external
        onlyRole(MODULE_ROLE)
    {
        emit EvidenceLinked(parentEvidenceId, childEvidenceId);
    }
}
