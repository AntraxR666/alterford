// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract CreatorRegistry is Governed {
    struct Creator {
        AlterfordTypes.CreatorStatus status;
        uint256 createdMarkets;
        uint256 resolvedMarkets;
        uint256 fraudCount;
        uint256 disputeCount;
        uint256 volumeCreated;
        uint256 feesEarned;
        uint256 premiumUntil;
        string metadataURI;
    }

    mapping(address => Creator) public creators;

    event CreatorRegistered(address indexed creator, string metadataURI);
    event CreatorTierUpdated(address indexed creator, AlterfordTypes.CreatorStatus status);
    event CreatorSuspended(address indexed creator, bytes32 reasonHash);
    event CreatorStatsRecorded(address indexed creator, uint256 volumeCreated, uint256 feesEarned);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function registerCreator(string calldata metadataURI) external whenNotPaused {
        Creator storage creator = creators[msg.sender];
        if (creator.status != AlterfordTypes.CreatorStatus.Unregistered) {
            revert AlterfordErrors.InvalidState();
        }
        creator.status = AlterfordTypes.CreatorStatus.Basic;
        creator.metadataURI = metadataURI;
        emit CreatorRegistered(msg.sender, metadataURI);
    }

    function setCreatorStatus(address creator, AlterfordTypes.CreatorStatus status)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        creators[creator].status = status;
        emit CreatorTierUpdated(creator, status);
    }

    function recordMarketCreated(address creator) external onlyRole(MODULE_ROLE) {
        creators[creator].createdMarkets += 1;
    }

    function recordFraud(address creator, bytes32 reasonHash) external onlyRole(MODULE_ROLE) {
        creators[creator].fraudCount += 1;
        creators[creator].status = AlterfordTypes.CreatorStatus.Suspended;
        emit CreatorSuspended(creator, reasonHash);
    }
}
