// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract OracleRouter is Governed {
    struct OraclePolicy {
        AlterfordTypes.OracleType oracleType;
        uint16 minConfidence;
        bool assigned;
        bool immutablePolicy;
    }

    struct OracleResult {
        uint8 outcome;
        uint16 confidence;
        uint256 evidenceId;
        bool submitted;
        bool challenged;
    }

    mapping(AlterfordTypes.OracleType => address) public oracleAdapters;
    mapping(uint256 => OraclePolicy) public policyByMarket;
    mapping(uint256 => OracleResult) public resultByMarket;

    event OracleAdapterRegistered(
        AlterfordTypes.OracleType indexed oracleType, address indexed adapter
    );
    event OraclePolicyAssigned(
        uint256 indexed marketId, AlterfordTypes.OracleType oracleType, uint16 minConfidence
    );
    event OracleResolutionRequested(uint256 indexed marketId);
    event OracleResultSubmitted(
        uint256 indexed marketId, uint8 outcome, uint16 confidence, uint256 evidenceId
    );
    event OracleResultChallenged(uint256 indexed marketId, bytes32 reasonHash);
    event OracleFallbackTriggered(uint256 indexed marketId, bytes32 reasonHash);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function registerAdapter(AlterfordTypes.OracleType oracleType, address adapter)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        if (adapter == address(0)) revert AlterfordErrors.OracleAdapterUnavailable();
        oracleAdapters[oracleType] = adapter;
        emit OracleAdapterRegistered(oracleType, adapter);
    }

    function assignPolicy(
        uint256 marketId,
        AlterfordTypes.OracleType oracleType,
        uint16 minConfidence
    ) external onlyRole(MODULE_ROLE) {
        OraclePolicy storage policy = policyByMarket[marketId];
        if (policy.immutablePolicy) revert AlterfordErrors.OraclePolicyImmutable();
        policyByMarket[marketId] = OraclePolicy(oracleType, minConfidence, true, true);
        emit OraclePolicyAssigned(marketId, oracleType, minConfidence);
    }

    function submitResult(uint256 marketId, uint8 outcome, uint16 confidence, uint256 evidenceId)
        external
        onlyRole(RESOLVER_ROLE)
    {
        OraclePolicy memory policy = policyByMarket[marketId];
        if (!policy.assigned) revert AlterfordErrors.OracleResultMissing();
        if (confidence < policy.minConfidence) revert AlterfordErrors.OracleConfidenceTooLow();
        resultByMarket[marketId] = OracleResult(outcome, confidence, evidenceId, true, false);
        emit OracleResultSubmitted(marketId, outcome, confidence, evidenceId);
    }

    function challengeResult(uint256 marketId, bytes32 reasonHash) external onlyRole(ARBITER_ROLE) {
        resultByMarket[marketId].challenged = true;
        emit OracleResultChallenged(marketId, reasonHash);
    }
}
