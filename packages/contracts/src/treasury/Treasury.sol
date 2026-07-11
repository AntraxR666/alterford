// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "../token/IERC20.sol";
import { Governed } from "../security/Governed.sol";
import { ReentrancyGuardLite } from "../security/ReentrancyGuardLite.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract Treasury is Governed, ReentrancyGuardLite {
    struct Account {
        uint256 escrowed;
        uint256 adminFees;
        uint256 creatorFees;
        uint256 refunds;
        uint256 slashed;
    }

    mapping(bytes32 => Account) public accounts;
    mapping(address => uint256) public creatorFeeBalance;
    mapping(address => uint256) public adminFeeBalance;

    event EscrowDeposited(
        bytes32 indexed entityId, address indexed token, address indexed from, uint256 amount
    );
    event EscrowReleased(
        bytes32 indexed entityId, address indexed token, address indexed to, uint256 amount
    );
    event FeesAccrued(
        bytes32 indexed entityId, address indexed creator, uint256 adminFee, uint256 creatorFee
    );
    event RefundCredited(bytes32 indexed entityId, address indexed user, uint256 amount);
    event BondSlashed(bytes32 indexed entityId, uint256 amount, bytes32 reasonHash);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function depositEscrow(bytes32 entityId, address token, address from, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyRole(MODULE_ROLE)
    {
        if (amount == 0) revert AlterfordErrors.InvalidAmount();
        if (from != msg.sender) revert AlterfordErrors.Unauthorized();
        accounts[entityId].escrowed += amount;
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) {
            revert AlterfordErrors.TransferFailed();
        }
        emit EscrowDeposited(entityId, token, from, amount);
    }

    function releaseEscrow(bytes32 entityId, address token, address to, uint256 amount)
        external
        nonReentrant
        onlyRole(MODULE_ROLE)
    {
        Account storage account = accounts[entityId];
        if (account.escrowed < amount) revert AlterfordErrors.InsufficientEscrow();
        account.escrowed -= amount;
        if (!IERC20(token).transfer(to, amount)) revert AlterfordErrors.TransferFailed();
        emit EscrowReleased(entityId, token, to, amount);
    }

    function accrueFees(bytes32 entityId, address creator, uint256 adminFee, uint256 creatorFee)
        external
        onlyRole(MODULE_ROLE)
    {
        Account storage account = accounts[entityId];
        uint256 total = adminFee + creatorFee;
        if (account.escrowed < total) revert AlterfordErrors.InsufficientEscrow();
        account.escrowed -= total;
        account.adminFees += adminFee;
        account.creatorFees += creatorFee;
        adminFeeBalance[admin] += adminFee;
        creatorFeeBalance[creator] += creatorFee;
        emit FeesAccrued(entityId, creator, adminFee, creatorFee);
    }

    function slashBond(bytes32 entityId, uint256 amount, bytes32 reasonHash)
        external
        onlyRole(MODULE_ROLE)
    {
        Account storage account = accounts[entityId];
        if (account.escrowed < amount) revert AlterfordErrors.InsufficientEscrow();
        account.escrowed -= amount;
        account.slashed += amount;
        emit BondSlashed(entityId, amount, reasonHash);
    }
}
