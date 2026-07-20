import { relations } from "drizzle-orm/relations";
import {
  stores,
  admins,
  aiCreditBalances,
  aiCreditLedger,
  aiCreditPurchases,
  blogCategories,
  blogs,
  blogComments,
  users,
  blogLikes,
  blogTags,
  cardColors,
  categories,
  coupons,
  customerAddresses,
  emailCampaigns,
  emailCampaignRecipients,
  enquiries,
  homepageSections,
  orders,
  orderItems,
  products,
  productVariants,
  planEvents,
  productReviews,
  taxClasses,
  roles,
  stockMovements,
  storeBillingSettings,
  storeBrandProfiles,
  storeCounters,
  storeMenus,
  storePages,
  storePaymentProviders,
  storeSubscriptions,
  userGroups,
  aiUsage,
  couponUserGroups,
  userGroupMembers,
} from "./schema";

export const adminsRelations = relations(admins, ({ one, many }) => ({
  store: one(stores, {
    fields: [admins.storeId],
    references: [stores.id],
  }),
  admin: one(admins, {
    fields: [admins.invitedBy],
    references: [admins.id],
    relationName: "admins_invitedBy_admins_id",
  }),
  admins: many(admins, {
    relationName: "admins_invitedBy_admins_id",
  }),
}));

export const storesRelations = relations(stores, ({ many }) => ({
  admins: many(admins),
  aiCreditBalances: many(aiCreditBalances),
  aiCreditLedgers: many(aiCreditLedger),
  aiCreditPurchases: many(aiCreditPurchases),
  blogCategories: many(blogCategories),
  blogComments: many(blogComments),
  blogLikes: many(blogLikes),
  blogTags: many(blogTags),
  blogs: many(blogs),
  cardColors: many(cardColors),
  categories: many(categories),
  coupons: many(coupons),
  customerAddresses: many(customerAddresses),
  emailCampaignRecipients: many(emailCampaignRecipients),
  emailCampaigns: many(emailCampaigns),
  enquiries: many(enquiries),
  homepageSections: many(homepageSections),
  orders: many(orders),
  planEvents: many(planEvents),
  productReviews: many(productReviews),
  productVariants: many(productVariants),
  products: many(products),
  roles: many(roles),
  stockMovements: many(stockMovements),
  storeBillingSettings: many(storeBillingSettings),
  storeBrandProfiles: many(storeBrandProfiles),
  storeCounters: many(storeCounters),
  storeMenus: many(storeMenus),
  storePages: many(storePages),
  storePaymentProviders: many(storePaymentProviders),
  storeSubscriptions: many(storeSubscriptions),
  taxClasses: many(taxClasses),
  userGroups: many(userGroups),
  users: many(users),
  aiUsages: many(aiUsage),
  couponUserGroups: many(couponUserGroups),
  userGroupMembers: many(userGroupMembers),
}));

export const aiCreditBalancesRelations = relations(
  aiCreditBalances,
  ({ one }) => ({
    store: one(stores, {
      fields: [aiCreditBalances.storeId],
      references: [stores.id],
    }),
  }),
);

export const aiCreditLedgerRelations = relations(aiCreditLedger, ({ one }) => ({
  store: one(stores, {
    fields: [aiCreditLedger.storeId],
    references: [stores.id],
  }),
}));

export const aiCreditPurchasesRelations = relations(
  aiCreditPurchases,
  ({ one }) => ({
    store: one(stores, {
      fields: [aiCreditPurchases.storeId],
      references: [stores.id],
    }),
  }),
);

export const blogCategoriesRelations = relations(blogCategories, ({ one }) => ({
  store: one(stores, {
    fields: [blogCategories.storeId],
    references: [stores.id],
  }),
}));

export const blogCommentsRelations = relations(blogComments, ({ one }) => ({
  blog: one(blogs, {
    fields: [blogComments.blogId],
    references: [blogs.id],
  }),
  user: one(users, {
    fields: [blogComments.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [blogComments.storeId],
    references: [stores.id],
  }),
}));

export const blogsRelations = relations(blogs, ({ one, many }) => ({
  blogComments: many(blogComments),
  blogLikes: many(blogLikes),
  store: one(stores, {
    fields: [blogs.storeId],
    references: [stores.id],
  }),
  user: one(users, {
    fields: [blogs.submittedBy],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  blogComments: many(blogComments),
  blogs: many(blogs),
  customerAddresses: many(customerAddresses),
  orders: many(orders),
  productReviews: many(productReviews),
  store: one(stores, {
    fields: [users.storeId],
    references: [stores.id],
  }),
  userGroupMembers: many(userGroupMembers),
}));

export const blogLikesRelations = relations(blogLikes, ({ one }) => ({
  blog: one(blogs, {
    fields: [blogLikes.blogId],
    references: [blogs.id],
  }),
  store: one(stores, {
    fields: [blogLikes.storeId],
    references: [stores.id],
  }),
}));

export const blogTagsRelations = relations(blogTags, ({ one }) => ({
  store: one(stores, {
    fields: [blogTags.storeId],
    references: [stores.id],
  }),
}));

export const cardColorsRelations = relations(cardColors, ({ one }) => ({
  store: one(stores, {
    fields: [cardColors.storeId],
    references: [stores.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  store: one(stores, {
    fields: [categories.storeId],
    references: [stores.id],
  }),
  products: many(products),
}));

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  store: one(stores, {
    fields: [coupons.storeId],
    references: [stores.id],
  }),
  couponUserGroups: many(couponUserGroups),
}));

export const customerAddressesRelations = relations(
  customerAddresses,
  ({ one }) => ({
    store: one(stores, {
      fields: [customerAddresses.storeId],
      references: [stores.id],
    }),
    user: one(users, {
      fields: [customerAddresses.userId],
      references: [users.id],
    }),
  }),
);

export const emailCampaignRecipientsRelations = relations(
  emailCampaignRecipients,
  ({ one }) => ({
    emailCampaign: one(emailCampaigns, {
      fields: [emailCampaignRecipients.campaignId],
      references: [emailCampaigns.id],
    }),
    store: one(stores, {
      fields: [emailCampaignRecipients.storeId],
      references: [stores.id],
    }),
  }),
);

export const emailCampaignsRelations = relations(
  emailCampaigns,
  ({ one, many }) => ({
    emailCampaignRecipients: many(emailCampaignRecipients),
    store: one(stores, {
      fields: [emailCampaigns.storeId],
      references: [stores.id],
    }),
  }),
);

export const enquiriesRelations = relations(enquiries, ({ one }) => ({
  store: one(stores, {
    fields: [enquiries.storeId],
    references: [stores.id],
  }),
}));

export const homepageSectionsRelations = relations(
  homepageSections,
  ({ one }) => ({
    store: one(stores, {
      fields: [homepageSections.storeId],
      references: [stores.id],
    }),
  }),
);

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  productVariant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  orderItems: many(orderItems),
  user: one(users, {
    fields: [orders.customerId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [orders.storeId],
    references: [stores.id],
  }),
  stockMovements: many(stockMovements),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  orderItems: many(orderItems),
  productReviews: many(productReviews),
  productVariants: many(productVariants),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  store: one(stores, {
    fields: [products.storeId],
    references: [stores.id],
  }),
  taxClass: one(taxClasses, {
    fields: [products.taxClassId],
    references: [taxClasses.id],
  }),
  stockMovements: many(stockMovements),
}));

export const productVariantsRelations = relations(
  productVariants,
  ({ one, many }) => ({
    orderItems: many(orderItems),
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
    store: one(stores, {
      fields: [productVariants.storeId],
      references: [stores.id],
    }),
    stockMovements: many(stockMovements),
  }),
);

export const planEventsRelations = relations(planEvents, ({ one }) => ({
  store: one(stores, {
    fields: [planEvents.storeId],
    references: [stores.id],
  }),
}));

export const productReviewsRelations = relations(productReviews, ({ one }) => ({
  user: one(users, {
    fields: [productReviews.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [productReviews.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [productReviews.storeId],
    references: [stores.id],
  }),
}));

export const taxClassesRelations = relations(taxClasses, ({ one, many }) => ({
  products: many(products),
  storeBillingSettings: many(storeBillingSettings),
  store: one(stores, {
    fields: [taxClasses.storeId],
    references: [stores.id],
  }),
}));

export const rolesRelations = relations(roles, ({ one }) => ({
  store: one(stores, {
    fields: [roles.storeId],
    references: [stores.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  order: one(orders, {
    fields: [stockMovements.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [stockMovements.storeId],
    references: [stores.id],
  }),
  productVariant: one(productVariants, {
    fields: [stockMovements.variantId],
    references: [productVariants.id],
  }),
}));

export const storeBillingSettingsRelations = relations(
  storeBillingSettings,
  ({ one }) => ({
    taxClass: one(taxClasses, {
      fields: [storeBillingSettings.defaultTaxClassId],
      references: [taxClasses.id],
    }),
    store: one(stores, {
      fields: [storeBillingSettings.storeId],
      references: [stores.id],
    }),
  }),
);

export const storeBrandProfilesRelations = relations(
  storeBrandProfiles,
  ({ one }) => ({
    store: one(stores, {
      fields: [storeBrandProfiles.storeId],
      references: [stores.id],
    }),
  }),
);

export const storeCountersRelations = relations(storeCounters, ({ one }) => ({
  store: one(stores, {
    fields: [storeCounters.storeId],
    references: [stores.id],
  }),
}));

export const storeMenusRelations = relations(storeMenus, ({ one }) => ({
  store: one(stores, {
    fields: [storeMenus.storeId],
    references: [stores.id],
  }),
}));

export const storePagesRelations = relations(storePages, ({ one }) => ({
  store: one(stores, {
    fields: [storePages.storeId],
    references: [stores.id],
  }),
}));

export const storePaymentProvidersRelations = relations(
  storePaymentProviders,
  ({ one }) => ({
    store: one(stores, {
      fields: [storePaymentProviders.storeId],
      references: [stores.id],
    }),
  }),
);

export const storeSubscriptionsRelations = relations(
  storeSubscriptions,
  ({ one }) => ({
    store: one(stores, {
      fields: [storeSubscriptions.storeId],
      references: [stores.id],
    }),
  }),
);

export const userGroupsRelations = relations(userGroups, ({ one, many }) => ({
  store: one(stores, {
    fields: [userGroups.storeId],
    references: [stores.id],
  }),
  couponUserGroups: many(couponUserGroups),
  userGroupMembers: many(userGroupMembers),
}));

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  store: one(stores, {
    fields: [aiUsage.storeId],
    references: [stores.id],
  }),
}));

export const couponUserGroupsRelations = relations(
  couponUserGroups,
  ({ one }) => ({
    coupon: one(coupons, {
      fields: [couponUserGroups.couponId],
      references: [coupons.id],
    }),
    userGroup: one(userGroups, {
      fields: [couponUserGroups.groupId],
      references: [userGroups.id],
    }),
    store: one(stores, {
      fields: [couponUserGroups.storeId],
      references: [stores.id],
    }),
  }),
);

export const userGroupMembersRelations = relations(
  userGroupMembers,
  ({ one }) => ({
    user: one(users, {
      fields: [userGroupMembers.userId],
      references: [users.id],
    }),
    userGroup: one(userGroups, {
      fields: [userGroupMembers.groupId],
      references: [userGroups.id],
    }),
    store: one(stores, {
      fields: [userGroupMembers.storeId],
      references: [stores.id],
    }),
  }),
);
