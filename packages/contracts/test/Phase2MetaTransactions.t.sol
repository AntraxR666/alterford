// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AlterfordForwarder } from "../src/metatx/AlterfordForwarder.sol";
import { ERC2771Forwarder } from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import { ChallengeFactory } from "../src/factories/ChallengeFactory.sol";
import { CreationBondPolicy } from "../src/bonds/CreationBondPolicy.sol";
import { AlterfordTypes } from "../src/libraries/AlterfordTypes.sol";
import { MockSettlementToken } from "../src/token/MockSettlementToken.sol";

interface VmPhase2 {
    function addr(uint256 privateKey) external returns (address);
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
}

contract Phase2MetaTransactionsTest {
    VmPhase2 internal constant vm =
        VmPhase2(address(uint160(uint256(keccak256("hevm cheat code")))));

    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );

    function testForwardedChallengeCreationUsesSignerAndRejectsReplay() public {
        uint256 creatorKey = 0xA11CE;
        address creator = vm.addr(creatorKey);
        AlterfordForwarder forwarder = new AlterfordForwarder();
        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        ChallengeFactory factory =
            new ChallengeFactory(address(this), address(policy), address(forwarder));
        MockSettlementToken token = new MockSettlementToken();

        token.mint(creator, 30_000_000);
        vm.prank(creator);
        token.approve(address(factory), 30_000_000);

        bytes memory data = abi.encodeCall(
            ChallengeFactory.createChallenge,
            (
                address(token),
                20_000_000,
                keccak256("phase-2-rules"),
                "ipfs://phase-2-challenge",
                block.timestamp + 12 hours,
                _bondContext(20_000_000)
            )
        );
        ERC2771Forwarder.ForwardRequestData memory request = ERC2771Forwarder.ForwardRequestData({
            from: creator,
            to: address(factory),
            value: 0,
            gas: 1_500_000,
            deadline: uint48(block.timestamp + 15 minutes),
            data: data,
            signature: ""
        });
        request.signature = _signRequest(forwarder, request, creatorKey, 0);

        forwarder.execute(request);

        (address recordedCreator,,,,,,,,,,,) = factory.challenges(1);
        require(recordedCreator == creator, "forwarded signer not recorded");
        require(forwarder.nonces(creator) == 1, "forwarder nonce not consumed");

        try forwarder.execute(request) {
            revert("forward request replay accepted");
        } catch { }
    }

    function testForwarderRejectsInvalidSignerExpiredRequestAndUntrustedTarget() public {
        uint256 signerKey = 0xA11CE;
        address signer = vm.addr(signerKey);
        AlterfordForwarder forwarder = new AlterfordForwarder();
        ERC2771Forwarder.ForwardRequestData memory request = ERC2771Forwarder.ForwardRequestData({
            from: signer,
            to: address(new MockSettlementToken()),
            value: 0,
            gas: 200_000,
            deadline: uint48(block.timestamp + 15 minutes),
            data: abi.encodeWithSignature("totalSupply()"),
            signature: ""
        });

        request.signature = _signRequest(forwarder, request, 0xB0B, 0);
        require(!forwarder.verify(request), "invalid signer accepted");

        request.signature = _signRequest(forwarder, request, signerKey, 0);
        require(!forwarder.verify(request), "untrusted target accepted");

        CreationBondPolicy policy = new CreationBondPolicy(address(this));
        ChallengeFactory factory =
            new ChallengeFactory(address(this), address(policy), address(forwarder));
        request.to = address(factory);
        request.deadline = uint48(block.timestamp - 1);
        request.data = abi.encodeWithSignature("pause()");
        request.signature = _signRequest(forwarder, request, signerKey, 0);
        require(!forwarder.verify(request), "expired request accepted");
    }

    function testForwardedRoleCheckUsesOriginalSigner() public {
        uint256 adminKey = 0xAD111;
        address admin = vm.addr(adminKey);
        AlterfordForwarder forwarder = new AlterfordForwarder();
        CreationBondPolicy policy = new CreationBondPolicy(admin);
        ChallengeFactory factory = new ChallengeFactory(admin, address(policy), address(forwarder));
        ERC2771Forwarder.ForwardRequestData memory request = ERC2771Forwarder.ForwardRequestData({
            from: admin,
            to: address(factory),
            value: 0,
            gas: 200_000,
            deadline: uint48(block.timestamp + 15 minutes),
            data: abi.encodeWithSignature("pause()"),
            signature: ""
        });
        request.signature = _signRequest(forwarder, request, adminKey, 0);

        forwarder.execute(request);

        require(factory.paused(), "forwarded role signer not recognized");
    }

    function _signRequest(
        AlterfordForwarder forwarder,
        ERC2771Forwarder.ForwardRequestData memory request,
        uint256 privateKey,
        uint256 nonce
    ) private returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("AlterfordForwarder")),
                keccak256(bytes("1")),
                block.chainid,
                address(forwarder)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                FORWARD_REQUEST_TYPEHASH,
                request.from,
                request.to,
                request.value,
                request.gas,
                nonce,
                request.deadline,
                keccak256(request.data)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _bondContext(uint256 expectedVolume)
        private
        pure
        returns (CreationBondPolicy.BondContext memory)
    {
        return CreationBondPolicy.BondContext({
            entityType: AlterfordTypes.EntityType.Challenge,
            mode: AlterfordTypes.Mode.Vanilla,
            creatorTier: AlterfordTypes.CreatorTier.Basic,
            categoryRisk: AlterfordTypes.RiskLevel.Low,
            reputation: AlterfordTypes.ReputationBand.New,
            expectedVolume: expectedVolume,
            disputeCount: 0,
            fraudCount: 0
        });
    }
}
