// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";

contract AntiSybilEngine is Governed {
    mapping(address => uint16) public sybilRiskScore;
    mapping(address => bool) public promotionalRewardBlocked;
    mapping(address => uint256) public enhancedBondRequired;

    event SybilRiskUpdated(address indexed subject, uint16 score, bytes32 reasonHash);
    event PromotionalRewardBlocked(address indexed user, bytes32 reasonHash);
    event EnhancedBondRequired(address indexed user, uint256 amount, bytes32 reasonHash);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function setSybilRisk(address subject, uint16 score, bytes32 reasonHash)
        external
        onlyRole(MODULE_ROLE)
    {
        require(score <= 10_000, "SCORE_RANGE");
        sybilRiskScore[subject] = score;
        emit SybilRiskUpdated(subject, score, reasonHash);
    }

    function blockPromotionalReward(address user, bytes32 reasonHash)
        external
        onlyRole(MODULE_ROLE)
    {
        promotionalRewardBlocked[user] = true;
        emit PromotionalRewardBlocked(user, reasonHash);
    }

    function requireEnhancedBond(address user, uint256 amount, bytes32 reasonHash)
        external
        onlyRole(MODULE_ROLE)
    {
        enhancedBondRequired[user] = amount;
        emit EnhancedBondRequired(user, amount, reasonHash);
    }
}
