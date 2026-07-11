// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract CreatorMonetization is Governed {
    mapping(address => uint256) public tipsReceived;
    mapping(address => uint256) public premiumUntil;

    event CreatorTipSent(address indexed from, address indexed creator, uint256 amount);
    event CreatorSubscriptionStarted(
        address indexed subscriber, address indexed creator, uint256 expiresAt
    );
    event CreatorSubscriptionCancelled(address indexed subscriber, address indexed creator);
    event CreatorMonetizationPayoutAccrued(address indexed creator, uint256 amount);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function recordTip(address from, address creator, uint256 amount)
        external
        onlyRole(MODULE_ROLE)
    {
        if (creator == address(0) || amount == 0) {
            revert AlterfordErrors.InvalidAmount();
        }
        tipsReceived[creator] += amount;
        emit CreatorTipSent(from, creator, amount);
        emit CreatorMonetizationPayoutAccrued(creator, amount);
    }

    function recordSubscription(address subscriber, address creator, uint256 expiresAt)
        external
        onlyRole(MODULE_ROLE)
    {
        if (creator == address(0) || expiresAt <= block.timestamp) {
            revert AlterfordErrors.InvalidAmount();
        }
        premiumUntil[subscriber] = expiresAt;
        emit CreatorSubscriptionStarted(subscriber, creator, expiresAt);
    }
}
