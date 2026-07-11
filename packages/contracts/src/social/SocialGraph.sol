// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";

contract SocialGraph is Governed {
    mapping(address => mapping(address => bool)) public follows;
    mapping(address => mapping(uint256 => bool)) public watchesMarket;
    mapping(address => mapping(bytes32 => bool)) public watchesCategory;

    event UserFollowed(address indexed follower, address indexed target);
    event UserUnfollowed(address indexed follower, address indexed target);
    event MarketWatched(address indexed user, uint256 indexed marketId);
    event CategoryWatched(address indexed user, bytes32 indexed categoryId);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function follow(address target) external whenNotPaused {
        follows[msg.sender][target] = true;
        emit UserFollowed(msg.sender, target);
    }

    function unfollow(address target) external {
        follows[msg.sender][target] = false;
        emit UserUnfollowed(msg.sender, target);
    }

    function watchMarket(uint256 marketId) external whenNotPaused {
        watchesMarket[msg.sender][marketId] = true;
        emit MarketWatched(msg.sender, marketId);
    }

    function watchCategory(bytes32 categoryId) external whenNotPaused {
        watchesCategory[msg.sender][categoryId] = true;
        emit CategoryWatched(msg.sender, categoryId);
    }
}
