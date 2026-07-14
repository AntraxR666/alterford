// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { FeePolicy } from "../libraries/FeePolicy.sol";

contract RewardDistributor is Governed {
    mapping(bytes32 => mapping(address => bool)) public claimed;

    event RewardClaimed(bytes32 indexed entityId, address indexed user, uint256 amount);
    event RefundClaimed(bytes32 indexed entityId, address indexed user, uint256 amount);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function calculateFees(uint256 losingPool)
        public
        pure
        returns (uint256 adminFee, uint256 creatorFee, uint256 totalFee)
    {
        return calculateMarketFees(losingPool * 2, losingPool);
    }

    function calculateMarketFees(uint256 totalPool, uint256 losingPool)
        public
        pure
        returns (uint256 adminFee, uint256 creatorFee, uint256 totalFee)
    {
        (adminFee, creatorFee, totalFee) = FeePolicy.marketFees(totalPool, losingPool);
    }

    function calculateChallengeFees(uint256 rewardPool)
        public
        pure
        returns (uint256 adminFee, uint256 creatorFee, uint256 totalFee)
    {
        (adminFee, creatorFee, totalFee) = FeePolicy.challengeFees(rewardPool);
    }

    function calculateWinnerPayout(
        uint256 userWinningStake,
        uint256 winningPool,
        uint256 losingPool
    ) public pure returns (uint256) {
        if (winningPool == 0) revert AlterfordErrors.NoWinners();
        (,, uint256 totalFee) = calculateMarketFees(winningPool + losingPool, losingPool);
        uint256 losingPoolAfterFees = losingPool - totalFee;
        return userWinningStake + ((userWinningStake * losingPoolAfterFees) / winningPool);
    }

    function markRewardClaimed(bytes32 entityId, address user, uint256 amount)
        external
        onlyRole(MODULE_ROLE)
    {
        if (claimed[entityId][user]) revert AlterfordErrors.AlreadyClaimed();
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        claimed[entityId][user] = true;
        emit RewardClaimed(entityId, user, amount);
    }

    function markRefundClaimed(bytes32 entityId, address user, uint256 amount)
        external
        onlyRole(MODULE_ROLE)
    {
        if (claimed[entityId][user]) revert AlterfordErrors.AlreadyClaimed();
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        claimed[entityId][user] = true;
        emit RefundClaimed(entityId, user, amount);
    }
}
