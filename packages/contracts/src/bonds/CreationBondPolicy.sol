// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";

contract CreationBondPolicy is Governed {
    uint16 private constant BPS_DENOMINATOR_NUMBER = 10_000;

    uint16 public constant REASON_SMALL_LOW_RISK = 1 << 0;
    uint16 public constant REASON_UNDERWORLD = 1 << 1;
    uint16 public constant REASON_HIGH_RISK = 1 << 2;
    uint16 public constant REASON_VERIFIED_DISCOUNT = 1 << 3;
    uint16 public constant REASON_FRAUD_HISTORY = 1 << 4;
    uint16 public constant REASON_DISPUTE_HISTORY = 1 << 5;
    uint16 public constant REASON_VOLUME = 1 << 6;

    struct BondConfig {
        uint256 minBond;
        uint256 lowRiskBaseBond;
        uint256 standardBaseBond;
        uint256 highRiskBaseBond;
        uint256 maxBond;
        uint256 smallMarketVolumeThreshold;
        uint256 volumeStep;
        uint256 volumeStepBond;
        uint16 verifiedDiscountBps;
        uint16 premiumDiscountBps;
        uint16 underworldMultiplierBps;
        uint16 highRiskMultiplierBps;
        uint16 disputeSurchargeBps;
        uint16 fraudMultiplierBps;
    }

    struct BondContext {
        AlterfordTypes.EntityType entityType;
        AlterfordTypes.Mode mode;
        AlterfordTypes.CreatorTier creatorTier;
        AlterfordTypes.RiskLevel categoryRisk;
        AlterfordTypes.ReputationBand reputation;
        uint256 expectedVolume;
        uint256 disputeCount;
        uint256 fraudCount;
    }

    BondConfig public config;

    event BondPolicyUpdated(BondConfig config);

    constructor(address initialAdmin) Governed(initialAdmin) {
        config = BondConfig({
            minBond: 500_000,
            lowRiskBaseBond: 500_000,
            standardBaseBond: 3_000_000,
            highRiskBaseBond: 5_000_000,
            maxBond: 10_000_000,
            smallMarketVolumeThreshold: 50_000_000,
            volumeStep: 250_000_000,
            volumeStepBond: 1_000_000,
            verifiedDiscountBps: 2_000,
            premiumDiscountBps: 4_000,
            underworldMultiplierBps: 15_000,
            highRiskMultiplierBps: 15_000,
            disputeSurchargeBps: 1_000,
            fraudMultiplierBps: 20_000
        });
        emit BondPolicyUpdated(config);
    }

    function updateConfig(BondConfig calldata nextConfig) external onlyRole(GOVERNOR_ROLE) {
        _assertConfig(nextConfig);
        config = nextConfig;
        emit BondPolicyUpdated(nextConfig);
    }

    function calculateBond(BondContext calldata context) external view returns (uint256) {
        (uint256 amount,) = previewBond(context);
        return amount;
    }

    function previewBond(BondContext calldata context)
        public
        view
        returns (uint256 amount, uint16 reasonFlags)
    {
        BondConfig memory activeConfig = config;
        _assertConfig(activeConfig);

        amount = _baseBond(context, activeConfig);

        if (_isSmallLowRiskVanilla(context, activeConfig)) {
            reasonFlags |= REASON_SMALL_LOW_RISK;
        }

        uint256 volumePremium = _volumePremium(context.expectedVolume, activeConfig);
        if (volumePremium > 0) {
            amount += volumePremium;
            reasonFlags |= REASON_VOLUME;
        }

        if (context.mode == AlterfordTypes.Mode.Underworld) {
            amount = _applyBps(amount, activeConfig.underworldMultiplierBps);
            reasonFlags |= REASON_UNDERWORLD;
        }

        if (
            context.categoryRisk == AlterfordTypes.RiskLevel.High
                || context.categoryRisk == AlterfordTypes.RiskLevel.Critical
        ) {
            amount = _applyBps(amount, activeConfig.highRiskMultiplierBps);
            reasonFlags |= REASON_HIGH_RISK;
        }

        if (context.disputeCount > 0) {
            amount = _applyBps(
                amount,
                uint16(
                    BPS_DENOMINATOR_NUMBER + context.disputeCount * activeConfig.disputeSurchargeBps
                )
            );
            reasonFlags |= REASON_DISPUTE_HISTORY;
        }

        if (
            context.fraudCount > 0 || context.creatorTier == AlterfordTypes.CreatorTier.Suspended
                || context.reputation == AlterfordTypes.ReputationBand.Risky
        ) {
            amount = _applyBps(amount, activeConfig.fraudMultiplierBps);
            reasonFlags |= REASON_FRAUD_HISTORY;
        }

        if (
            context.creatorTier == AlterfordTypes.CreatorTier.Verified
                || context.creatorTier == AlterfordTypes.CreatorTier.Premium
                || context.reputation == AlterfordTypes.ReputationBand.Trusted
        ) {
            uint16 discount = context.creatorTier == AlterfordTypes.CreatorTier.Premium
                ? activeConfig.premiumDiscountBps
                : activeConfig.verifiedDiscountBps;
            amount = (amount * (BPS_DENOMINATOR_NUMBER - discount)) / BPS_DENOMINATOR_NUMBER;
            reasonFlags |= REASON_VERIFIED_DISCOUNT;
        }

        amount = _clamp(amount, activeConfig.minBond, activeConfig.maxBond);
    }

    function _baseBond(BondContext memory context, BondConfig memory activeConfig)
        private
        pure
        returns (uint256)
    {
        if (_isSmallLowRiskVanilla(context, activeConfig)) {
            return activeConfig.lowRiskBaseBond;
        }

        if (
            context.mode == AlterfordTypes.Mode.Underworld
                || context.categoryRisk == AlterfordTypes.RiskLevel.High
                || context.categoryRisk == AlterfordTypes.RiskLevel.Critical
                || context.entityType == AlterfordTypes.EntityType.Challenge
        ) {
            return activeConfig.highRiskBaseBond;
        }

        return activeConfig.standardBaseBond;
    }

    function _isSmallLowRiskVanilla(BondContext memory context, BondConfig memory activeConfig)
        private
        pure
        returns (bool)
    {
        return context.entityType == AlterfordTypes.EntityType.Market
            && context.mode == AlterfordTypes.Mode.Vanilla
            && context.categoryRisk == AlterfordTypes.RiskLevel.Low
            && context.expectedVolume <= activeConfig.smallMarketVolumeThreshold
            && context.disputeCount == 0 && context.fraudCount == 0;
    }

    function _volumePremium(uint256 expectedVolume, BondConfig memory activeConfig)
        private
        pure
        returns (uint256)
    {
        if (expectedVolume <= activeConfig.volumeStep) {
            return 0;
        }
        uint256 volumeSteps = expectedVolume / activeConfig.volumeStep;
        return volumeSteps * activeConfig.volumeStepBond;
    }

    function _applyBps(uint256 amount, uint16 bps) private pure returns (uint256) {
        return (amount * bps) / BPS_DENOMINATOR_NUMBER;
    }

    function _clamp(uint256 amount, uint256 minBond, uint256 maxBond)
        private
        pure
        returns (uint256)
    {
        if (amount < minBond) return minBond;
        if (amount > maxBond) return maxBond;
        return amount;
    }

    function _assertConfig(BondConfig memory bondConfig) private pure {
        if (bondConfig.minBond == 0 || bondConfig.maxBond < bondConfig.minBond) {
            revert AlterfordErrors.InvalidBondPolicy();
        }
    }
}
