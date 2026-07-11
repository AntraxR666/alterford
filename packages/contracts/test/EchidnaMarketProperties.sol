// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AlterfordTypes } from "../src/libraries/AlterfordTypes.sol";
import { FeePolicy } from "../src/libraries/FeePolicy.sol";

contract EchidnaMarketProperties {
    function property_standard_market_fee_split_is_preserved() external pure returns (bool) {
        (uint256 adminFee, uint256 creatorFee, uint256 totalFee) =
            FeePolicy.marketFees(1_000_000_000, 400_000_000);

        return adminFee == 8_000_000 && creatorFee == 6_000_000 && totalFee == 14_000_000;
    }

    function property_market_fee_never_exceeds_legacy_ceiling() external pure returns (bool) {
        (,, uint256 smallTotal) = FeePolicy.marketFees(50_000_000, 20_000_000);
        (,, uint256 standardTotal) = FeePolicy.marketFees(1_000_000_000, 400_000_000);
        (,, uint256 largeTotal) = FeePolicy.marketFees(5_000_000_000, 2_000_000_000);
        (,, uint256 whaleTotal) = FeePolicy.marketFees(50_000_000_000, 20_000_000_000);

        return smallTotal
                <= (20_000_000 * AlterfordTypes.TOTAL_FEE_BPS) / AlterfordTypes.BPS_DENOMINATOR
            && standardTotal
                <= (400_000_000 * AlterfordTypes.TOTAL_FEE_BPS) / AlterfordTypes.BPS_DENOMINATOR
            && largeTotal
                <= (2_000_000_000 * AlterfordTypes.TOTAL_FEE_BPS) / AlterfordTypes.BPS_DENOMINATOR
            && whaleTotal
                <= (20_000_000_000 * AlterfordTypes.TOTAL_FEE_BPS) / AlterfordTypes.BPS_DENOMINATOR;
    }

    function property_challenge_fee_is_platform_only_and_capped() external pure returns (bool) {
        (uint256 smallAdmin, uint256 smallCreator, uint256 smallTotal) =
            FeePolicy.challengeFees(100_000_000);
        (uint256 whaleAdmin, uint256 whaleCreator, uint256 whaleTotal) =
            FeePolicy.challengeFees(20_000_000_000);

        return smallAdmin == smallTotal && smallCreator == 0 && smallTotal == 10_000_000
            && whaleAdmin == whaleTotal && whaleCreator == 0 && whaleTotal == 800_000_000;
    }
}
