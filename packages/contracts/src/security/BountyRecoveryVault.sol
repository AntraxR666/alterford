// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BountyRecoveryVault is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant SECURITY_ADMIN_ROLE = keccak256("SECURITY_ADMIN_ROLE");

    address public immutable coldWallet;

    event EmergencyLiquidityRecovered(
        address indexed token,
        address indexed coldWallet,
        uint256 amount,
        bytes32 indexed incidentHash,
        address securityAdmin
    );

    error InvalidAddress();
    error InvalidAmount();
    error InvalidIncidentHash();

    constructor(address securityCouncil, address coldWallet_) {
        if (securityCouncil == address(0) || coldWallet_ == address(0)) revert InvalidAddress();
        coldWallet = coldWallet_;
        _grantRole(DEFAULT_ADMIN_ROLE, securityCouncil);
        _grantRole(SECURITY_ADMIN_ROLE, securityCouncil);
    }

    function recoverToColdWallet(address token, uint256 amount, bytes32 incidentHash)
        external
        nonReentrant
        onlyRole(SECURITY_ADMIN_ROLE)
    {
        if (token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (incidentHash == bytes32(0)) revert InvalidIncidentHash();

        IERC20(token).safeTransfer(coldWallet, amount);
        emit EmergencyLiquidityRecovered(token, coldWallet, amount, incidentHash, msg.sender);
    }
}
