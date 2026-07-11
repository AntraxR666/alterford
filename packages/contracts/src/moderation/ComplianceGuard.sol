// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";

contract ComplianceGuard is Governed {
    mapping(bytes32 => bool) public restrictedRegions;
    mapping(bytes32 => bool) public restrictedCategories;

    event CompliancePolicyUpdated(bytes32 indexed policyHash);
    event RegionRestricted(bytes32 indexed regionHash, bool restricted);
    event CategoryRestricted(bytes32 indexed categoryHash, bool restricted);
    event ParticipationBlocked(address indexed user, bytes32 indexed reasonHash);
    event ComplianceReviewLogged(
        bytes32 indexed entityType, uint256 indexed entityId, bytes32 reasonHash
    );

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function setRegionRestriction(bytes32 regionHash, bool restricted)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        restrictedRegions[regionHash] = restricted;
        emit RegionRestricted(regionHash, restricted);
    }

    function setCategoryRestriction(bytes32 categoryHash, bool restricted)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        restrictedCategories[categoryHash] = restricted;
        emit CategoryRestricted(categoryHash, restricted);
    }

    function logBlockedParticipation(address user, bytes32 reasonHash)
        external
        onlyRole(MODULE_ROLE)
    {
        emit ParticipationBlocked(user, reasonHash);
    }
}
