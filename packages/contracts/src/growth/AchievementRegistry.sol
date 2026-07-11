// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract AchievementRegistry is Governed {
    struct Achievement {
        string metadataURI;
        bool active;
    }

    mapping(bytes32 => Achievement) public achievements;
    mapping(address => mapping(bytes32 => bool)) public issued;

    event AchievementMetadataUpdated(bytes32 indexed achievementId, string metadataURI);
    event AchievementIssued(
        address indexed user, bytes32 indexed achievementId, uint256 indexed seasonId
    );
    event AchievementRevoked(
        address indexed user, bytes32 indexed achievementId, bytes32 reasonHash
    );

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function setAchievement(bytes32 achievementId, string calldata metadataURI, bool active)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        if (achievementId == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        achievements[achievementId] = Achievement(metadataURI, active);
        emit AchievementMetadataUpdated(achievementId, metadataURI);
    }

    function issue(address user, bytes32 achievementId, uint256 seasonId)
        external
        onlyRole(MODULE_ROLE)
    {
        if (!achievements[achievementId].active) revert AlterfordErrors.InvalidState();
        issued[user][achievementId] = true;
        emit AchievementIssued(user, achievementId, seasonId);
    }

    function revoke(address user, bytes32 achievementId, bytes32 reasonHash)
        external
        onlyRole(ARBITER_ROLE)
    {
        issued[user][achievementId] = false;
        emit AchievementRevoked(user, achievementId, reasonHash);
    }
}
