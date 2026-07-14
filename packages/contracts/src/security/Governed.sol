// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

abstract contract Governed {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER");
    bytes32 public constant RESOLVER_ROLE = keccak256("RESOLVER");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER");
    bytes32 public constant MODULE_ROLE = keccak256("MODULE");
    bytes32 public constant WATCHER_ROLE = keccak256("WATCHER");

    address public immutable admin;
    mapping(bytes32 => mapping(address => bool)) public hasRole;
    bool public paused;

    event RoleUpdated(bytes32 indexed role, address indexed account, bool enabled);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    constructor(address initialAdmin) {
        admin = initialAdmin;
        hasRole[GOVERNOR_ROLE][initialAdmin] = true;
        hasRole[PAUSER_ROLE][initialAdmin] = true;
        hasRole[RESOLVER_ROLE][initialAdmin] = true;
        hasRole[ARBITER_ROLE][initialAdmin] = true;
        hasRole[MODULE_ROLE][initialAdmin] = true;
        emit RoleUpdated(GOVERNOR_ROLE, initialAdmin, true);
        emit RoleUpdated(PAUSER_ROLE, initialAdmin, true);
        emit RoleUpdated(RESOLVER_ROLE, initialAdmin, true);
        emit RoleUpdated(ARBITER_ROLE, initialAdmin, true);
        emit RoleUpdated(MODULE_ROLE, initialAdmin, true);
    }

    modifier onlyRole(bytes32 role) {
        if (!hasRole[role][msg.sender]) revert AlterfordErrors.Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert AlterfordErrors.Paused();
        _;
    }

    function setRole(bytes32 role, address account, bool enabled) external onlyRole(GOVERNOR_ROLE) {
        hasRole[role][account] = enabled;
        emit RoleUpdated(role, account, enabled);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        paused = false;
        emit Unpaused(msg.sender);
    }
}
