// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";
import { CreationBondPolicy } from "./CreationBondPolicy.sol";

contract CreationBondContextResolver is Governed {
    uint8 public constant MARKET_MASK = uint8(1 << uint8(AlterfordTypes.EntityType.Market));
    uint8 public constant BOUNTY_MASK = uint8(1 << uint8(AlterfordTypes.EntityType.Bounty));
    uint8 public constant CHALLENGE_MASK = uint8(1 << uint8(AlterfordTypes.EntityType.Challenge));

    bytes32 public constant CATEGORY_SPORTS = keccak256("SPORTS");
    bytes32 public constant CATEGORY_WEATHER = keccak256("WEATHER");
    bytes32 public constant CATEGORY_TECHNOLOGY = keccak256("TECHNOLOGY");
    bytes32 public constant CATEGORY_CRYPTO = keccak256("CRYPTO");
    bytes32 public constant CATEGORY_CULTURE_POP = keccak256("CULTURE_POP");
    bytes32 public constant CATEGORY_NEWS = keccak256("NEWS");
    bytes32 public constant CATEGORY_VANILLA_MARKET = keccak256("VANILLA_MARKET");
    bytes32 public constant CATEGORY_USER_MARKETS = keccak256("USER_MARKETS");
    bytes32 public constant CATEGORY_STRANGE_EVENTS = keccak256("STRANGE_EVENTS");
    bytes32 public constant CATEGORY_VIRAL = keccak256("VIRAL");
    bytes32 public constant CATEGORY_VANILLA_BOUNTY = keccak256("VANILLA_BOUNTY");
    bytes32 public constant CATEGORY_UNDERWORLD_BOUNTY = keccak256("UNDERWORLD_BOUNTY");
    bytes32 public constant CATEGORY_VANILLA_CHALLENGE = keccak256("VANILLA_CHALLENGE");
    bytes32 public constant CATEGORY_UNDERWORLD_CHALLENGE = keccak256("UNDERWORLD_CHALLENGE");
    bytes32 public constant CATEGORY_VANILLA_PERFORMER_OFFER = keccak256("VANILLA_PERFORMER_OFFER");
    bytes32 public constant CATEGORY_UNDERWORLD_PERFORMER_OFFER =
        keccak256("UNDERWORLD_PERFORMER_OFFER");

    struct CategoryRule {
        uint8 entityMask;
        AlterfordTypes.Mode mode;
        AlterfordTypes.RiskLevel riskLevel;
        bool enabled;
    }

    struct CreatorProfile {
        AlterfordTypes.CreatorTier creatorTier;
        AlterfordTypes.ReputationBand reputation;
        uint256 disputeCount;
        uint256 fraudCount;
    }

    mapping(bytes32 => CategoryRule) public categoryRules;
    mapping(address => CreatorProfile) public creatorProfiles;

    event BondCategoryRuleUpdated(
        bytes32 indexed categoryId,
        uint8 entityMask,
        AlterfordTypes.Mode mode,
        AlterfordTypes.RiskLevel riskLevel,
        bool enabled
    );
    event CreatorBondProfileUpdated(
        address indexed creator,
        AlterfordTypes.CreatorTier creatorTier,
        AlterfordTypes.ReputationBand reputation,
        uint256 disputeCount,
        uint256 fraudCount,
        address indexed attestor
    );

    constructor(address initialAdmin) Governed(initialAdmin) {
        _setCategory(
            CATEGORY_SPORTS,
            MARKET_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Low,
            true
        );
        _setCategory(
            CATEGORY_WEATHER,
            MARKET_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Low,
            true
        );
        _setCategory(
            CATEGORY_TECHNOLOGY,
            MARKET_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_CRYPTO,
            MARKET_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_CULTURE_POP,
            MARKET_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_NEWS,
            MARKET_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_VANILLA_MARKET,
            MARKET_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_USER_MARKETS,
            MARKET_MASK,
            AlterfordTypes.Mode.Underworld,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_STRANGE_EVENTS,
            MARKET_MASK,
            AlterfordTypes.Mode.Underworld,
            AlterfordTypes.RiskLevel.High,
            true
        );
        _setCategory(
            CATEGORY_VIRAL,
            MARKET_MASK,
            AlterfordTypes.Mode.Underworld,
            AlterfordTypes.RiskLevel.High,
            true
        );
        _setCategory(
            CATEGORY_VANILLA_BOUNTY,
            BOUNTY_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_UNDERWORLD_BOUNTY,
            BOUNTY_MASK,
            AlterfordTypes.Mode.Underworld,
            AlterfordTypes.RiskLevel.High,
            true
        );
        _setCategory(
            CATEGORY_VANILLA_CHALLENGE,
            CHALLENGE_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_UNDERWORLD_CHALLENGE,
            CHALLENGE_MASK,
            AlterfordTypes.Mode.Underworld,
            AlterfordTypes.RiskLevel.High,
            true
        );
        _setCategory(
            CATEGORY_VANILLA_PERFORMER_OFFER,
            CHALLENGE_MASK,
            AlterfordTypes.Mode.Vanilla,
            AlterfordTypes.RiskLevel.Medium,
            true
        );
        _setCategory(
            CATEGORY_UNDERWORLD_PERFORMER_OFFER,
            CHALLENGE_MASK,
            AlterfordTypes.Mode.Underworld,
            AlterfordTypes.RiskLevel.High,
            true
        );
    }

    function setCategoryRule(
        bytes32 categoryId,
        uint8 entityMask,
        AlterfordTypes.Mode mode,
        AlterfordTypes.RiskLevel riskLevel,
        bool enabled
    ) external onlyRole(GOVERNOR_ROLE) {
        _setCategory(categoryId, entityMask, mode, riskLevel, enabled);
    }

    function setCreatorProfile(address creator, CreatorProfile calldata profile)
        external
        onlyRole(MODULE_ROLE)
    {
        if (creator == address(0)) revert AlterfordErrors.Unauthorized();
        creatorProfiles[creator] = profile;
        emit CreatorBondProfileUpdated(
            creator,
            profile.creatorTier,
            profile.reputation,
            profile.disputeCount,
            profile.fraudCount,
            _actor()
        );
    }

    function resolve(
        address creator,
        AlterfordTypes.EntityType entityType,
        bytes32 categoryId,
        uint256 expectedVolume
    ) public view returns (CreationBondPolicy.BondContext memory context) {
        CategoryRule memory rule = categoryRules[categoryId];
        uint8 entityMask = uint8(1 << uint8(entityType));
        if (!rule.enabled || (rule.entityMask & entityMask) == 0) {
            revert AlterfordErrors.InvalidBondPolicy();
        }

        CreatorProfile memory profile = creatorProfiles[creator];
        context = CreationBondPolicy.BondContext({
            entityType: entityType,
            mode: rule.mode,
            creatorTier: profile.creatorTier,
            categoryRisk: rule.riskLevel,
            reputation: profile.reputation,
            expectedVolume: expectedVolume,
            disputeCount: profile.disputeCount,
            fraudCount: profile.fraudCount
        });
    }

    function previewBond(
        address policy,
        address creator,
        AlterfordTypes.EntityType entityType,
        bytes32 categoryId,
        uint256 expectedVolume
    ) external view returns (uint256 amount, uint16 reasonFlags) {
        if (policy == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        CreationBondPolicy.BondContext memory context =
            resolve(creator, entityType, categoryId, expectedVolume);
        (amount, reasonFlags) = CreationBondPolicy(policy).previewBond(context);
    }

    function _setCategory(
        bytes32 categoryId,
        uint8 entityMask,
        AlterfordTypes.Mode mode,
        AlterfordTypes.RiskLevel riskLevel,
        bool enabled
    ) private {
        uint8 validMask = MARKET_MASK | BOUNTY_MASK | CHALLENGE_MASK;
        if (categoryId == bytes32(0) || entityMask == 0 || (entityMask & ~validMask) != 0) {
            revert AlterfordErrors.InvalidBondPolicy();
        }
        categoryRules[categoryId] = CategoryRule(entityMask, mode, riskLevel, enabled);
        emit BondCategoryRuleUpdated(categoryId, entityMask, mode, riskLevel, enabled);
    }
}
