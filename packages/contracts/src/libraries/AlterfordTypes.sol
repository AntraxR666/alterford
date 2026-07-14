// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library AlterfordTypes {
    uint16 internal constant BPS_DENOMINATOR = 10_000;
    uint16 internal constant ADMIN_FEE_BPS = 200;
    uint16 internal constant CREATOR_FEE_BPS = 150;
    uint16 internal constant TOTAL_FEE_BPS = 350;
    uint16 internal constant MAX_TOTAL_FEE_BPS = 500;

    enum MarketState {
        Draft,
        Open,
        Locked,
        Resolved,
        Disputed,
        Cancelled,
        Fraud,
        Expired,
        Settled
    }

    enum BountyState {
        Open,
        SubmissionClosed,
        Review,
        Resolved,
        Cancelled,
        Fraud,
        Refunded,
        Settled,
        EmergencyRecovered
    }

    enum ChallengeState {
        Open,
        Accepted,
        EvidenceSubmitted,
        Review,
        Resolved,
        Cancelled,
        Fraud,
        Refunded,
        Disputed
    }

    enum CreatorStatus {
        Unregistered,
        Basic,
        Verified,
        Premium,
        Suspended,
        Banned
    }

    enum NoWinnersPolicy {
        RefundAll,
        RolloverToNextMarket,
        CreatorDefinedCharityTreasury,
        ProtocolTreasury
    }

    enum OracleType {
        ManualArbiter,
        TrustedDataProvider,
        OptimisticOracle,
        SportsOracle,
        WeatherOracle,
        CryptoPriceOracle,
        NewsEventOracle,
        CommunityEvidenceOracle,
        HybridOracle
    }

    enum EntityType {
        Market,
        Bounty,
        Challenge
    }

    enum Mode {
        Vanilla,
        Underworld
    }

    enum CreatorTier {
        Basic,
        Verified,
        Premium,
        Suspended
    }

    enum RiskLevel {
        Low,
        Medium,
        High,
        Critical
    }

    enum ReputationBand {
        New,
        Trusted,
        Risky
    }

    enum ModerationStatus {
        Clean,
        Flagged,
        Hidden,
        UnderReview,
        Escalated,
        Restricted,
        Cleared,
        ConfirmedViolation
    }
}
