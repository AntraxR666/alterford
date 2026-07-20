// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Six-decimal Base Sepolia settlement token with EIP-2612 approvals.
/// @dev `permit` lets a relayer submit an allowance without the holder owning native ETH.
contract MockSettlementToken is ERC20, ERC20Permit {
    constructor() ERC20("Alterford Test USDT", "aUSDT") ERC20Permit("Alterford Test USDT") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(to != address(0), "ZERO_TO");
        _mint(to, amount);
    }
}
