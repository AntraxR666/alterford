// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract QuestEngine is Governed {
    enum QuestState {
        Inactive,
        Active,
        Completed,
        Claimed,
        Expired,
        Revoked
    }

    struct Quest {
        bytes32 criteriaHash;
        uint64 startTime;
        uint64 endTime;
        QuestState state;
    }

    uint256 public nextQuestId = 1;
    mapping(uint256 => Quest) public quests;
    mapping(uint256 => mapping(address => QuestState)) public userQuestState;

    event QuestCreated(
        uint256 indexed questId, bytes32 criteriaHash, uint64 startTime, uint64 endTime
    );
    event QuestCompleted(uint256 indexed questId, address indexed user);
    event QuestRewardClaimed(uint256 indexed questId, address indexed user);
    event QuestRevoked(uint256 indexed questId, bytes32 reasonHash);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function createQuest(bytes32 criteriaHash, uint64 startTime, uint64 endTime)
        external
        onlyRole(GOVERNOR_ROLE)
        returns (uint256 questId)
    {
        if (criteriaHash == bytes32(0) || endTime <= startTime) {
            revert AlterfordErrors.InvalidAmount();
        }
        questId = nextQuestId++;
        quests[questId] = Quest(criteriaHash, startTime, endTime, QuestState.Active);
        emit QuestCreated(questId, criteriaHash, startTime, endTime);
    }

    function completeQuest(uint256 questId, address user) external onlyRole(MODULE_ROLE) {
        Quest storage quest = quests[questId];
        if (quest.state != QuestState.Active) revert AlterfordErrors.InvalidState();
        userQuestState[questId][user] = QuestState.Completed;
        emit QuestCompleted(questId, user);
    }

    function claimQuestReward(uint256 questId) external {
        if (userQuestState[questId][msg.sender] != QuestState.Completed) {
            revert AlterfordErrors.InvalidState();
        }
        userQuestState[questId][msg.sender] = QuestState.Claimed;
        emit QuestRewardClaimed(questId, msg.sender);
    }
}
