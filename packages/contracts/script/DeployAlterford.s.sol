// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { CreationBondContextResolver } from "../src/bonds/CreationBondContextResolver.sol";
import { BountyFactory } from "../src/factories/BountyFactory.sol";
import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { MarketFactory } from "../src/factories/MarketFactory.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";
import { BountyRecoveryVault } from "../src/security/BountyRecoveryVault.sol";
import { AlterfordForwarder } from "../src/metatx/AlterfordForwarder.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployAlterford {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run(
        address admin,
        address settlementTokenAddress,
        address creationBondPolicyAddress,
        address securityCouncil,
        address coldWallet
    ) external {
        VM.startBroadcast();

        MockSettlementToken settlementToken = settlementTokenAddress == address(0)
            ? new MockSettlementToken()
            : MockSettlementToken(settlementTokenAddress);
        CreationBondPolicy creationBondPolicy = creationBondPolicyAddress == address(0)
            ? new CreationBondPolicy(admin)
            : CreationBondPolicy(creationBondPolicyAddress);
        CreationBondContextResolver bondContextResolver = new CreationBondContextResolver(admin);
        AlterfordForwarder forwarder = new AlterfordForwarder();
        new MarketFactory(admin, address(creationBondPolicy), address(bondContextResolver));
        BountyFactory bountyFactory =
            new BountyFactory(admin, address(creationBondPolicy), address(bondContextResolver));
        new ChallengeFactory(
            admin, address(creationBondPolicy), address(bondContextResolver), address(forwarder)
        );
        BountyRecoveryVault recoveryVault = new BountyRecoveryVault(securityCouncil, coldWallet);
        bountyFactory.setRecoveryVault(address(recoveryVault));

        settlementToken.totalSupply();

        VM.stopBroadcast();
    }
}
