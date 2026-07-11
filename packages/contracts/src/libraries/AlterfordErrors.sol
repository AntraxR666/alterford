// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library AlterfordErrors {
    error Unauthorized();
    error Paused();
    error InvalidToken();
    error InvalidAmount();
    error InvalidState();
    error InvalidOutcome();
    error MarketLocked();
    error MarketNotResolved();
    error AlreadyClaimed();
    error NothingToClaim();
    error InsufficientEscrow();
    error InvalidMetadataHash();
    error BondRequired();
    error DisputeWindowActive();
    error DisputeWindowExpired();
    error NoWinners();
    error FraudConfirmed();
    error TransferFailed();
    error FeeTooHigh();
    error UnsupportedChain();
    error SelfReferralNotAllowed();
    error ReferralAlreadySet();
    error InvalidReferralCode();
    error BlockedReferrer();
    error OraclePolicyImmutable();
    error OracleAdapterUnavailable();
    error OracleResultMissing();
    error OracleConfidenceTooLow();
    error EvidenceImmutable();
    error BondAlreadyFinalized();
    error InvalidBondPolicy();
}
