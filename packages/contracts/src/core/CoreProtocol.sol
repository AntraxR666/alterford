// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";
import { AlterfordTypes } from "../libraries/AlterfordTypes.sol";

contract CoreProtocol is Governed {
    uint16 public adminFeeBps = AlterfordTypes.ADMIN_FEE_BPS;
    uint16 public creatorFeeBps = AlterfordTypes.CREATOR_FEE_BPS;
    uint16 public totalFeeBps = AlterfordTypes.TOTAL_FEE_BPS;
    address public creationBondPolicy;
    uint256 public constant DISPUTE_WINDOW = 24 hours;

    mapping(bytes32 => address) public modules;
    mapping(address => bool) public supportedSettlementTokens;
    mapping(uint256 => bool) public supportedChains;

    event ModuleRegistered(bytes32 indexed moduleId, address indexed module);
    event SettlementTokenUpdated(address indexed token, bool enabled);
    event SupportedChainUpdated(uint256 indexed chainId, bool enabled);
    event FeesUpdated(uint16 adminFeeBps, uint16 creatorFeeBps, uint16 totalFeeBps);
    event CreationBondPolicyUpdated(address indexed policy);

    constructor(address initialAdmin) Governed(initialAdmin) {
        supportedChains[8453] = true;
        supportedChains[84532] = true;
        supportedChains[42161] = true;
        supportedChains[137] = true;
        supportedChains[10] = true;
    }

    function registerModule(bytes32 moduleId, address module) external onlyRole(GOVERNOR_ROLE) {
        if (module == address(0)) revert AlterfordErrors.InvalidAmount();
        modules[moduleId] = module;
        emit ModuleRegistered(moduleId, module);
    }

    function setSettlementToken(address token, bool enabled) external onlyRole(GOVERNOR_ROLE) {
        if (token == address(0)) revert AlterfordErrors.InvalidToken();
        supportedSettlementTokens[token] = enabled;
        emit SettlementTokenUpdated(token, enabled);
    }

    function setSupportedChain(uint256 chainId, bool enabled) external onlyRole(GOVERNOR_ROLE) {
        supportedChains[chainId] = enabled;
        emit SupportedChainUpdated(chainId, enabled);
    }

    function setFees(uint16 newAdminFeeBps, uint16 newCreatorFeeBps)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        uint16 newTotal = newAdminFeeBps + newCreatorFeeBps;
        if (newTotal > AlterfordTypes.MAX_TOTAL_FEE_BPS) revert AlterfordErrors.FeeTooHigh();
        adminFeeBps = newAdminFeeBps;
        creatorFeeBps = newCreatorFeeBps;
        totalFeeBps = newTotal;
        emit FeesUpdated(newAdminFeeBps, newCreatorFeeBps, newTotal);
    }

    function setCreationBondPolicy(address policy) external onlyRole(GOVERNOR_ROLE) {
        if (policy == address(0)) revert AlterfordErrors.InvalidBondPolicy();
        creationBondPolicy = policy;
        emit CreationBondPolicyUpdated(policy);
    }
}
