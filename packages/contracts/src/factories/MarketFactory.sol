// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { ReentrancyGuardLite } from "../security/ReentrancyGuardLite.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { FeePolicy } from "../libraries/FeePolicy.sol";
import { CreationBondPolicy } from "../bonds/CreationBondPolicy.sol";
import { IERC20 } from "../token/IERC20.sol";

contract MarketFactory is Governed, ReentrancyGuardLite {
    struct Market {
        address creator;
        address settlementToken;
        bytes32 metadataHash;
        string metadataURI;
        uint256 lockTime;
        uint256 resolutionTime;
        AlterfordTypes.MarketState state;
        AlterfordTypes.NoWinnersPolicy noWinnersPolicy;
        uint8 winningOutcome;
        string[] outcomes;
    }

    uint256 public nextMarketId = 1;
    CreationBondPolicy public bondPolicy;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(uint8 => uint256)) public poolByOutcome;
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) public stakeByUserOutcome;
    mapping(uint256 => mapping(address => uint256)) public totalStakeByUser;
    mapping(uint256 => uint256) public totalPoolByMarket;
    mapping(uint256 => mapping(address => bool)) public rewardClaimed;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;
    mapping(uint256 => bool) public feesSettled;
    mapping(uint256 => uint256) public adminFeeByMarket;
    mapping(uint256 => uint256) public creatorFeeByMarket;
    mapping(uint256 => uint256) public remainingPayoutByMarket;
    mapping(uint256 => uint256) public rewardPaidByMarket;
    mapping(uint256 => uint256) public claimedWinningStakeByMarket;
    mapping(uint256 => uint256) public bondByMarket;
    mapping(uint256 => bool) public bondFinalized;

    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        address indexed settlementToken,
        bytes32 metadataHash,
        string metadataURI
    );
    event BetPlaced(
        uint256 indexed marketId, address indexed user, uint8 indexed outcome, uint256 amount
    );
    event MarketLocked(uint256 indexed marketId);
    event MarketResolved(uint256 indexed marketId, uint8 winningOutcome);
    event MarketCancelled(uint256 indexed marketId, bytes32 reasonHash);
    event FeesAccrued(
        uint256 indexed marketId,
        address indexed admin,
        address indexed creator,
        uint256 adminFee,
        uint256 creatorFee
    );
    event RewardClaimed(uint256 indexed marketId, address indexed user, uint256 amount);
    event RefundClaimed(uint256 indexed marketId, address indexed user, uint256 amount);
    event MarketFraudConfirmed(uint256 indexed marketId, bytes32 reasonHash);
    event BondPolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
    event BondCalculated(
        bytes32 indexed entityType,
        uint256 indexed entityId,
        address indexed creator,
        uint256 requiredBond,
        uint16 reasonFlags
    );
    event BondLocked(
        bytes32 indexed entityType,
        uint256 indexed entityId,
        address indexed creator,
        uint256 amount
    );
    event BondReleased(
        bytes32 indexed entityType,
        uint256 indexed entityId,
        address indexed creator,
        uint256 amount
    );
    event BondSlashed(
        bytes32 indexed entityType, uint256 indexed entityId, uint256 amount, bytes32 reasonHash
    );

    constructor(address initialAdmin, address initialBondPolicy) Governed(initialAdmin) {
        if (initialBondPolicy == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        bondPolicy = CreationBondPolicy(initialBondPolicy);
        emit BondPolicyUpdated(address(0), initialBondPolicy);
    }

    function setBondPolicy(address nextBondPolicy) external onlyRole(GOVERNOR_ROLE) {
        if (nextBondPolicy == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        address oldPolicy = address(bondPolicy);
        bondPolicy = CreationBondPolicy(nextBondPolicy);
        emit BondPolicyUpdated(oldPolicy, nextBondPolicy);
    }

    function createMarket(
        address settlementToken,
        bytes32 metadataHash,
        string calldata metadataURI,
        string[] calldata outcomes,
        uint256 lockTime,
        uint256 resolutionTime,
        AlterfordTypes.NoWinnersPolicy noWinnersPolicy,
        CreationBondPolicy.BondContext calldata bondContext
    ) external nonReentrant whenNotPaused returns (uint256 marketId) {
        if (settlementToken == address(0)) revert AlterfordErrors.InvalidToken();
        if (metadataHash == bytes32(0)) revert AlterfordErrors.InvalidMetadataHash();
        if (outcomes.length < 2 || outcomes.length > 16) revert AlterfordErrors.InvalidOutcome();
        if (lockTime <= block.timestamp || resolutionTime <= lockTime) {
            revert AlterfordErrors.InvalidAmount();
        }
        if (bondContext.entityType != AlterfordTypes.EntityType.Market) {
            revert AlterfordErrors.InvalidBondPolicy();
        }

        (uint256 requiredBond, uint16 reasonFlags) = bondPolicy.previewBond(bondContext);
        marketId = nextMarketId++;

        Market storage market = markets[marketId];
        market.creator = msg.sender;
        market.settlementToken = settlementToken;
        market.metadataHash = metadataHash;
        market.metadataURI = metadataURI;
        market.lockTime = lockTime;
        market.resolutionTime = resolutionTime;
        market.state = AlterfordTypes.MarketState.Open;
        market.noWinnersPolicy = noWinnersPolicy;

        for (uint256 i = 0; i < outcomes.length; i++) {
            market.outcomes.push(outcomes[i]);
        }

        bondByMarket[marketId] = requiredBond;
        if (!IERC20(settlementToken).transferFrom(msg.sender, address(this), requiredBond)) {
            revert AlterfordErrors.TransferFailed();
        }

        emit BondCalculated("Market", marketId, msg.sender, requiredBond, reasonFlags);
        emit BondLocked("Market", marketId, msg.sender, requiredBond);
        emit MarketCreated(marketId, msg.sender, settlementToken, metadataHash, metadataURI);
    }

    function releaseBond(uint256 marketId) external nonReentrant onlyRole(GOVERNOR_ROLE) {
        _releaseBond(marketId);
    }

    function recordBet(uint256 marketId, address user, uint8 outcome, uint256 amount)
        external
        whenNotPaused
        onlyRole(MODULE_ROLE)
    {
        _recordBet(marketId, user, outcome, amount);
        emit BetPlaced(marketId, user, outcome, amount);
    }

    function placeBet(uint256 marketId, uint8 outcome, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        Market storage market = markets[marketId];
        _recordBet(marketId, msg.sender, outcome, amount);
        if (!IERC20(market.settlementToken).transferFrom(msg.sender, address(this), amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BetPlaced(marketId, msg.sender, outcome, amount);
    }

    function lockMarket(uint256 marketId) external {
        Market storage market = markets[marketId];
        if (block.timestamp < market.lockTime) revert AlterfordErrors.InvalidState();
        if (market.state != AlterfordTypes.MarketState.Open) revert AlterfordErrors.InvalidState();
        market.state = AlterfordTypes.MarketState.Locked;
        emit MarketLocked(marketId);
    }

    function resolveMarket(uint256 marketId, uint8 winningOutcome)
        external
        onlyRole(RESOLVER_ROLE)
    {
        Market storage market = markets[marketId];
        if (
            market.state != AlterfordTypes.MarketState.Locked
                && market.state != AlterfordTypes.MarketState.Open
        ) revert AlterfordErrors.InvalidState();
        if (block.timestamp < market.resolutionTime) revert AlterfordErrors.InvalidState();
        if (winningOutcome >= market.outcomes.length) revert AlterfordErrors.InvalidOutcome();
        market.state = AlterfordTypes.MarketState.Resolved;
        market.winningOutcome = winningOutcome;
        emit MarketResolved(marketId, winningOutcome);
        _settleFees(marketId);
    }

    function cancelMarket(uint256 marketId, bytes32 reasonHash) external onlyRole(ARBITER_ROLE) {
        Market storage market = markets[marketId];
        if (
            market.state != AlterfordTypes.MarketState.Open
                && market.state != AlterfordTypes.MarketState.Locked
        ) revert AlterfordErrors.InvalidState();
        market.state = AlterfordTypes.MarketState.Cancelled;
        emit MarketCancelled(marketId, reasonHash);
    }

    function claimReward(uint256 marketId) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        if (market.state != AlterfordTypes.MarketState.Resolved) {
            revert AlterfordErrors.MarketNotResolved();
        }
        if (rewardClaimed[marketId][msg.sender]) revert AlterfordErrors.AlreadyClaimed();

        uint256 winningPool = poolByOutcome[marketId][market.winningOutcome];
        if (winningPool == 0) revert AlterfordErrors.NoWinners();

        uint256 userWinningStake = stakeByUserOutcome[marketId][msg.sender][market.winningOutcome];
        if (userWinningStake == 0) revert AlterfordErrors.NothingToClaim();

        rewardClaimed[marketId][msg.sender] = true;
        claimedWinningStakeByMarket[marketId] += userWinningStake;

        uint256 payout;
        uint256 remainingPayout = remainingPayoutByMarket[marketId];
        if (claimedWinningStakeByMarket[marketId] == winningPool) {
            payout = remainingPayout - rewardPaidByMarket[marketId];
        } else {
            payout = (remainingPayout * userWinningStake) / winningPool;
        }
        rewardPaidByMarket[marketId] += payout;

        if (!IERC20(market.settlementToken).transfer(msg.sender, payout)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit RewardClaimed(marketId, msg.sender, payout);
    }

    function claimRefund(uint256 marketId) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        bool noWinners = market.state == AlterfordTypes.MarketState.Resolved
            && poolByOutcome[marketId][market.winningOutcome] == 0;
        if (market.state != AlterfordTypes.MarketState.Cancelled && !noWinners) {
            revert AlterfordErrors.InvalidState();
        }
        if (refundClaimed[marketId][msg.sender]) revert AlterfordErrors.AlreadyClaimed();

        uint256 refund = totalStakeByUser[marketId][msg.sender];
        if (refund == 0) revert AlterfordErrors.NothingToClaim();

        refundClaimed[marketId][msg.sender] = true;
        if (!IERC20(market.settlementToken).transfer(msg.sender, refund)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit RefundClaimed(marketId, msg.sender, refund);
    }

    function confirmFraud(uint256 marketId, bytes32 reasonHash) external onlyRole(ARBITER_ROLE) {
        markets[marketId].state = AlterfordTypes.MarketState.Fraud;
        _slashBond(marketId, reasonHash);
        emit MarketFraudConfirmed(marketId, reasonHash);
    }

    function _recordBet(uint256 marketId, address user, uint8 outcome, uint256 amount) private {
        Market storage market = markets[marketId];
        if (market.state != AlterfordTypes.MarketState.Open) revert AlterfordErrors.InvalidState();
        if (block.timestamp >= market.lockTime) revert AlterfordErrors.MarketLocked();
        if (outcome >= market.outcomes.length) revert AlterfordErrors.InvalidOutcome();
        if (amount == 0) revert AlterfordErrors.InvalidAmount();

        poolByOutcome[marketId][outcome] += amount;
        stakeByUserOutcome[marketId][user][outcome] += amount;
        totalStakeByUser[marketId][user] += amount;
        totalPoolByMarket[marketId] += amount;
    }

    function _settleFees(uint256 marketId) private {
        if (feesSettled[marketId]) return;

        Market storage market = markets[marketId];
        uint256 winningPool = poolByOutcome[marketId][market.winningOutcome];
        uint256 totalPool = totalPoolByMarket[marketId];
        if (winningPool == 0 || totalPool == 0) {
            feesSettled[marketId] = true;
            return;
        }

        uint256 losingPool = totalPool - winningPool;
        (uint256 adminFee, uint256 creatorFee, uint256 totalFee) =
            FeePolicy.marketFees(totalPool, losingPool);

        feesSettled[marketId] = true;
        adminFeeByMarket[marketId] = adminFee;
        creatorFeeByMarket[marketId] = creatorFee;
        remainingPayoutByMarket[marketId] = totalPool - totalFee;

        emit FeesAccrued(marketId, admin, market.creator, adminFee, creatorFee);
        if (adminFee > 0 && !IERC20(market.settlementToken).transfer(admin, adminFee)) {
            revert AlterfordErrors.TransferFailed();
        }
        if (creatorFee > 0 && !IERC20(market.settlementToken).transfer(market.creator, creatorFee))
        {
            revert AlterfordErrors.TransferFailed();
        }
    }

    function _releaseBond(uint256 marketId) private {
        if (bondFinalized[marketId]) revert AlterfordErrors.BondAlreadyFinalized();
        uint256 amount = bondByMarket[marketId];
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        Market storage market = markets[marketId];
        bondFinalized[marketId] = true;
        bondByMarket[marketId] = 0;
        if (!IERC20(market.settlementToken).transfer(market.creator, amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit BondReleased("Market", marketId, market.creator, amount);
    }

    function _slashBond(uint256 marketId, bytes32 reasonHash) private {
        if (bondFinalized[marketId]) revert AlterfordErrors.BondAlreadyFinalized();
        uint256 amount = bondByMarket[marketId];
        if (amount == 0) revert AlterfordErrors.NothingToClaim();
        bondFinalized[marketId] = true;
        bondByMarket[marketId] = 0;
        emit BondSlashed("Market", marketId, amount, reasonHash);
    }
}
