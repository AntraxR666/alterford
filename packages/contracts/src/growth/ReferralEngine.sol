// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract ReferralEngine is Governed {
    mapping(bytes32 => address) public referralCodeOwner;
    mapping(address => address) public referrerOf;
    mapping(address => uint256) public referralCount;
    mapping(address => bool) public blockedReferrers;

    event ReferralCodeCreated(bytes32 indexed codeHash, address indexed owner);
    event ReferralLinked(address indexed user, address indexed referrer, bytes32 indexed codeHash);
    event ReferralQualified(
        address indexed user, address indexed referrer, bytes32 qualificationType
    );
    event ReferrerBlocked(address indexed referrer, bytes32 reasonHash);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function createReferralCode(bytes32 codeHash) external whenNotPaused {
        if (codeHash == bytes32(0)) revert AlterfordErrors.InvalidReferralCode();
        if (referralCodeOwner[codeHash] != address(0)) {
            revert AlterfordErrors.InvalidReferralCode();
        }
        referralCodeOwner[codeHash] = msg.sender;
        emit ReferralCodeCreated(codeHash, msg.sender);
    }

    function linkReferral(bytes32 codeHash) external whenNotPaused {
        address referrer = referralCodeOwner[codeHash];
        if (referrer == address(0)) revert AlterfordErrors.InvalidReferralCode();
        if (referrer == msg.sender) revert AlterfordErrors.SelfReferralNotAllowed();
        if (blockedReferrers[referrer]) revert AlterfordErrors.BlockedReferrer();
        if (referrerOf[msg.sender] != address(0)) revert AlterfordErrors.ReferralAlreadySet();
        referrerOf[msg.sender] = referrer;
        referralCount[referrer] += 1;
        emit ReferralLinked(msg.sender, referrer, codeHash);
    }

    function qualifyReferral(address user, bytes32 qualificationType)
        external
        onlyRole(MODULE_ROLE)
    {
        address referrer = referrerOf[user];
        if (referrer == address(0)) revert AlterfordErrors.InvalidReferralCode();
        emit ReferralQualified(user, referrer, qualificationType);
    }

    function blockReferrer(address referrer, bytes32 reasonHash) external onlyRole(GOVERNOR_ROLE) {
        blockedReferrers[referrer] = true;
        emit ReferrerBlocked(referrer, reasonHash);
    }
}
