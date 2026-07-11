// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract CampaignManager is Governed {
    enum CampaignState {
        Created,
        Funded,
        Active,
        Paused,
        Completed
    }

    struct Campaign {
        address sponsor;
        address budgetToken;
        uint256 budget;
        uint256 spent;
        uint64 startTime;
        uint64 endTime;
        bytes32 rulesHash;
        CampaignState state;
    }

    uint256 public nextCampaignId = 1;
    mapping(uint256 => Campaign) public campaigns;
    mapping(uint256 => mapping(address => bool)) public rewardClaimed;

    event CampaignCreated(uint256 indexed campaignId, address indexed sponsor, bytes32 rulesHash);
    event CampaignFunded(uint256 indexed campaignId, address indexed token, uint256 amount);
    event CampaignActivated(uint256 indexed campaignId);
    event CampaignPaused(uint256 indexed campaignId);
    event CampaignCompleted(uint256 indexed campaignId);
    event CampaignRewardClaimed(uint256 indexed campaignId, address indexed user, uint256 amount);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function createCampaign(
        address budgetToken,
        uint64 startTime,
        uint64 endTime,
        bytes32 rulesHash
    ) external whenNotPaused returns (uint256 campaignId) {
        if (budgetToken == address(0) || rulesHash == bytes32(0) || endTime <= startTime) {
            revert AlterfordErrors.InvalidAmount();
        }
        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign({
            sponsor: msg.sender,
            budgetToken: budgetToken,
            budget: 0,
            spent: 0,
            startTime: startTime,
            endTime: endTime,
            rulesHash: rulesHash,
            state: CampaignState.Created
        });
        emit CampaignCreated(campaignId, msg.sender, rulesHash);
    }

    function recordFunding(uint256 campaignId, uint256 amount) external onlyRole(MODULE_ROLE) {
        if (amount == 0) revert AlterfordErrors.InvalidAmount();
        Campaign storage campaign = campaigns[campaignId];
        campaign.budget += amount;
        campaign.state = CampaignState.Funded;
        emit CampaignFunded(campaignId, campaign.budgetToken, amount);
    }

    function activate(uint256 campaignId) external onlyRole(GOVERNOR_ROLE) {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.budget == 0) revert AlterfordErrors.InsufficientEscrow();
        campaign.state = CampaignState.Active;
        emit CampaignActivated(campaignId);
    }

    function markRewardClaimed(uint256 campaignId, address user, uint256 amount)
        external
        onlyRole(MODULE_ROLE)
    {
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.state != CampaignState.Active) revert AlterfordErrors.InvalidState();
        if (rewardClaimed[campaignId][user]) revert AlterfordErrors.AlreadyClaimed();
        if (campaign.spent + amount > campaign.budget) revert AlterfordErrors.InsufficientEscrow();
        rewardClaimed[campaignId][user] = true;
        campaign.spent += amount;
        emit CampaignRewardClaimed(campaignId, user, amount);
    }
}
