// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { BountyFactory } from "../src/factories/BountyFactory.sol";
import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { MarketFactory } from "../src/factories/MarketFactory.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployAlterford {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run(address admin) external {
        VM.startBroadcast();

        MockSettlementToken settlementToken = new MockSettlementToken();
        CreationBondPolicy creationBondPolicy = new CreationBondPolicy(admin);
        new MarketFactory(admin, address(creationBondPolicy));
        new BountyFactory(admin, address(creationBondPolicy));
        new ChallengeFactory(admin, address(creationBondPolicy));

        settlementToken.totalSupply();

        VM.stopBroadcast();
    }
}
