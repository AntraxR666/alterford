// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Governed } from "../security/Governed.sol";
import { AlterfordErrors } from "../libraries/AlterfordErrors.sol";

contract SponsoredMarketRegistry is Governed {
    struct Sponsorship {
        address sponsor;
        string disclosureURI;
        bool active;
    }

    mapping(uint256 => Sponsorship) public sponsorshipByMarket;

    event MarketSponsored(uint256 indexed marketId, address indexed sponsor, string disclosureURI);
    event SponsorshipUpdated(uint256 indexed marketId, string disclosureURI);
    event SponsorshipEnded(uint256 indexed marketId);
    event SponsorVerified(address indexed sponsor);

    constructor(address initialAdmin) Governed(initialAdmin) { }

    function sponsorMarket(uint256 marketId, string calldata disclosureURI) external whenNotPaused {
        if (bytes(disclosureURI).length == 0) revert AlterfordErrors.InvalidMetadataHash();
        sponsorshipByMarket[marketId] = Sponsorship(msg.sender, disclosureURI, true);
        emit MarketSponsored(marketId, msg.sender, disclosureURI);
    }

    function endSponsorship(uint256 marketId) external {
        Sponsorship storage sponsorship = sponsorshipByMarket[marketId];
        if (sponsorship.sponsor != msg.sender && !hasRole[GOVERNOR_ROLE][msg.sender]) {
            revert AlterfordErrors.Unauthorized();
        }
        sponsorship.active = false;
        emit SponsorshipEnded(marketId);
    }
}
