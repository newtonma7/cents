# Cents

Cents helps clothing resellers prepare one listing and publish it across marketplaces.

## Language

**Seller**:
A person who creates a Cents account to publish clothing through marketplace accounts they control.
_Avoid_: User, tenant, customer

**Canonical Listing**:
A seller-owned, marketplace-neutral description of one physical apparel item, which may remain incomplete while drafted.
_Avoid_: Product, post, master listing

**Marketplace Listing**:
The representation of a Canonical Listing prepared for or published on one marketplace.
_Avoid_: Platform state, cross-listing

**Marketplace Override**:
A marketplace-specific presentation, price, or taxonomy selection that does not contradict the physical facts in its Canonical Listing.
_Avoid_: Platform field, listing fork

**Paired Browser**:
The one Seller-controlled Chrome profile currently authorized to retrieve a selected Canonical Listing for a Publish Run.
_Avoid_: Device connection, remote browser

**Marketplace Session**:
A marketplace's authenticated state inside a Paired Browser, owned and maintained by the Seller rather than Cents.
_Avoid_: Marketplace credentials, connected account

**Publish Run**:
A seller-initiated attempt to publish one Canonical Listing to one or more selected marketplaces.
_Avoid_: Batch job, sync
