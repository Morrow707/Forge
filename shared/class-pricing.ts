// Per-lesson pricing for Forge-official Classes.
//
// classLessons.priceCents has existed since Classes shipped: admin-settable
// through /api/admin/forge-class-lessons/:id/price, null meaning free, and
// applying only to a Forge-official Class sold to a Free Agent (a coach's
// own athletes never see a price on their coach's own Class -- see the
// Classes comment in shared/schema.ts). What has never existed is a way to
// pay it. There is no purchase route, nothing reads the field to gate
// enrollment, and it had no entry in the pricing catalog, so an admin could
// price a lesson and every athlete would still enroll for free.
//
// This file is the first half of closing that: the price a new Forge Class
// lesson is worth, in one place, enumerated in the admin catalog like every
// other number on the platform. The second half is a purchase route and an
// enrollment gate, which do not exist yet -- until they do, this constant
// is what an admin should be setting priceCents to, not something the
// server charges on its own.
export const FORGE_CLASS_LESSON_DEFAULT_PRICE_CENTS = 1499;

// Deliberately not in this file: the platform's share of a paid lesson.
// Every Class that can carry a price today is Forge-official, so Forge is
// both the author and the platform and a split has nobody to pay. It
// becomes a real number the first time a coach can sell their own Class,
// and it is a percentage rather than a cent amount, which the admin pricing
// catalog (cents-only, one integer per key) cannot represent as it stands.
