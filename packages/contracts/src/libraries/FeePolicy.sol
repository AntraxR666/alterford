// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AlterfordTypes } from "./AlterfordTypes.sol";

library FeePolicy {
    uint256 internal constant ONE_USDT = 1_000_000;
    uint256 internal constant SMALL_MARKET_POOL = 100 * ONE_USDT;
    uint256 internal constant LARGE_MARKET_POOL = 5_000 * ONE_USDT;
    uint256 internal constant VERY_LARGE_MARKET_POOL = 50_000 * ONE_USDT;

    uint256 internal constant SMALL_CHALLENGE_REWARD = 100 * ONE_USDT;
    uint256 internal constant STANDARD_CHALLENGE_REWARD = 1_000 * ONE_USDT;
    uint256 internal constant LARGE_CHALLENGE_REWARD = 10_000 * ONE_USDT;

    function marketFees(uint256 totalPool, uint256 losingPool)
        internal
        pure
        returns (uint256 adminFee, uint256 creatorFee, uint256 totalFee)
    {
        uint16 adminBps;
        uint16 creatorBps;

        if (totalPool >= VERY_LARGE_MARKET_POOL) {
            adminBps = 150;
            creatorBps = 50;
        } else if (totalPool >= LARGE_MARKET_POOL) {
            adminBps = 175;
            creatorBps = 75;
        } else if (totalPool < SMALL_MARKET_POOL) {
            adminBps = 200;
            creatorBps = 100;
        } else {
            adminBps = 200;
            creatorBps = 150;
        }

        adminFee = (losingPool * adminBps) / AlterfordTypes.BPS_DENOMINATOR;
        creatorFee = (losingPool * creatorBps) / AlterfordTypes.BPS_DENOMINATOR;
        totalFee = adminFee + creatorFee;
    }

    function challengeFees(uint256 rewardPool)
        internal
        pure
        returns (uint256 adminFee, uint256 creatorFee, uint256 totalFee)
    {
        uint16 adminBps;
        if (rewardPool <= SMALL_CHALLENGE_REWARD) {
            adminBps = 1_000;
        } else if (rewardPool <= STANDARD_CHALLENGE_REWARD) {
            adminBps = 800;
        } else if (rewardPool <= LARGE_CHALLENGE_REWARD) {
            adminBps = 600;
        } else {
            adminBps = 400;
        }

        adminFee = (rewardPool * adminBps) / AlterfordTypes.BPS_DENOMINATOR;
        creatorFee = 0;
        totalFee = adminFee;
    }
}
