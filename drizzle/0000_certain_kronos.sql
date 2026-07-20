-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SEQUENCE "public"."store_no_seq" INCREMENT BY 1 MINVALUE 1000 MAXVALUE 2147483647 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"force_password_reset" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_suspended" boolean DEFAULT false,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text,
	"phone" text,
	"store_id" uuid NOT NULL,
	CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['superadmin'::text, 'member'::text]))
);
--> statement-breakpoint
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_credit_balances" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_balances_balance_check" CHECK (balance >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_credit_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"kind" text NOT NULL,
	"ref" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_ledger_kind_check" CHECK (kind = ANY (ARRAY['purchase'::text, 'grant'::text, 'spend'::text]))
);
--> statement-breakpoint
ALTER TABLE "ai_credit_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_credit_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"credits" integer NOT NULL,
	"amount_inr" integer NOT NULL,
	"rzp_order_id" text,
	"rzp_payment_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credit_purchases_rzp_order_id_key" UNIQUE("rzp_order_id"),
	CONSTRAINT "ai_credit_purchases_amount_inr_check" CHECK (amount_inr > 0),
	CONSTRAINT "ai_credit_purchases_credits_check" CHECK (credits > 0),
	CONSTRAINT "ai_credit_purchases_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text]))
);
--> statement-breakpoint
ALTER TABLE "ai_credit_purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_categories_name_check" CHECK ((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 40))
);
--> statement-breakpoint
ALTER TABLE "blog_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blog_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "blog_comments_body_check" CHECK ((char_length(body) >= 1) AND (char_length(body) <= 2000))
);
--> statement-breakpoint
ALTER TABLE "blog_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blog_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blog_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reaction" text DEFAULT 'like' NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "blog_likes_blog_visitor_reaction_key" UNIQUE("blog_id","visitor_id","reaction"),
	CONSTRAINT "blog_likes_reaction_check" CHECK (reaction = ANY (ARRAY['like'::text, 'love'::text, 'haha'::text, 'wow'::text, 'celebrate'::text]))
);
--> statement-breakpoint
ALTER TABLE "blog_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blog_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_tags_name_check" CHECK ((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 40))
);
--> statement-breakpoint
ALTER TABLE "blog_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "blogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"content" text,
	"cover_image_url" text,
	"author" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"tags" text[] DEFAULT '{""}',
	"featured" boolean DEFAULT false NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"reading_time" integer,
	"created_by" uuid,
	"updated_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"categories" text[] DEFAULT '{""}',
	"submitted_by" uuid,
	"is_customer_submission" boolean DEFAULT false NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "blogs_store_slug_key" UNIQUE("slug","store_id")
);
--> statement-breakpoint
ALTER TABLE "blogs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "card_colors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hex" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_colors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "categories_store_slug_key" UNIQUE("slug","store_id")
);
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_order_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_uses" integer DEFAULT 0 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	"show_on_storefront" boolean DEFAULT false NOT NULL,
	CONSTRAINT "coupons_store_code_key" UNIQUE("code","store_id")
);
--> statement-breakpoint
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"email" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_campaign_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"code" text NOT NULL,
	"discount_label" text NOT NULL,
	"valid_until_label" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped_no_email" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject_detail" text,
	"store_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "homepage_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homepage_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"name" text NOT NULL,
	"variant_name" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tax_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_class_name" text
);
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text DEFAULT 'cash_on_delivery' NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"billing_address" jsonb,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"shipping" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"applied_coupon_code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stock_status" text DEFAULT 'none' NOT NULL,
	"order_no" integer NOT NULL,
	"order_ref" text NOT NULL,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	CONSTRAINT "orders_stock_status_check" CHECK (stock_status = ANY (ARRAY['none'::text, 'reserved'::text, 'released'::text]))
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"from_plan" text,
	"to_plan" text NOT NULL,
	"source" text NOT NULL,
	"actor" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_events_source_check" CHECK (source = ANY (ARRAY['operator'::text, 'billing'::text, 'system'::text]))
);
--> statement-breakpoint
ALTER TABLE "plan_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_key" UNIQUE("email"),
	CONSTRAINT "platform_admins_role_check" CHECK (role = ANY (ARRAY['superadmin'::text, 'member'::text]))
);
--> statement-breakpoint
ALTER TABLE "platform_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "product_reviews_product_id_customer_id_key" UNIQUE("product_id","user_id"),
	CONSTRAINT "product_reviews_rating_check" CHECK ((rating >= 1) AND (rating <= 5))
);
--> statement-breakpoint
ALTER TABLE "product_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"sku" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"base_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"selling_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"image_url" text,
	"images" text[] DEFAULT '{""}' NOT NULL,
	"special_price" numeric(10, 2),
	"store_id" uuid NOT NULL,
	"track_inventory" boolean DEFAULT true NOT NULL,
	"low_stock_threshold" integer,
	"allow_backorder" boolean DEFAULT false NOT NULL,
	"variant_no" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"image_url" text,
	"images" text[] DEFAULT '{""}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"base_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"selling_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"card_color" text,
	"store_id" uuid NOT NULL,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer,
	"allow_backorder" boolean DEFAULT false NOT NULL,
	"sku" text NOT NULL,
	"sku_no" integer NOT NULL,
	"variant_seq" integer DEFAULT 0 NOT NULL,
	"tax_class_id" uuid,
	CONSTRAINT "products_store_slug_key" UNIQUE("slug","store_id")
);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"color" text DEFAULT 'grey' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "roles_store_slug_key" UNIQUE("slug","store_id")
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"balance_after" integer NOT NULL,
	"order_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_billing_settings" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"tax_enabled" boolean DEFAULT false NOT NULL,
	"prices_include_tax" boolean DEFAULT false NOT NULL,
	"default_tax_class_id" uuid,
	"business_name" text,
	"business_address" text,
	"tax_id" text,
	"contact_email" text,
	"contact_phone" text,
	"logo_url" text,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"accent_color" text DEFAULT '#111111' NOT NULL,
	"footer_note" text,
	"terms" text,
	"template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "store_billing_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_brand_profiles" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"content_md" text DEFAULT '' NOT NULL,
	"structured" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "store_brand_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_counters" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"order_seq" integer DEFAULT 999 NOT NULL,
	"product_seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_menus" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"header" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"footer_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"footer_legal" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "store_menus" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"seo_title" text DEFAULT '' NOT NULL,
	"seo_description" text DEFAULT '' NOT NULL,
	"seo_noindex" boolean DEFAULT false NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_pages_store_id_slug_key" UNIQUE("store_id","slug"),
	CONSTRAINT "store_pages_slug_check" CHECK ((slug = ''::text) OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
	CONSTRAINT "store_pages_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);
--> statement-breakpoint
ALTER TABLE "store_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_payment_providers" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"key_id" text NOT NULL,
	"key_secret_enc" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_payment_providers_provider_check" CHECK (provider = 'razorpay'::text)
);
--> statement-breakpoint
ALTER TABLE "store_payment_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store_subscriptions" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"period" text NOT NULL,
	"rzp_subscription_id" text,
	"rzp_plan_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"current_start" timestamp with time zone,
	"current_end" timestamp with time zone,
	"mandate_max_paise" integer,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_subscriptions_rzp_subscription_id_key" UNIQUE("rzp_subscription_id"),
	CONSTRAINT "store_subscriptions_period_check" CHECK (period = ANY (ARRAY['monthly'::text, 'yearly'::text])),
	CONSTRAINT "store_subscriptions_plan_check" CHECK (plan = ANY (ARRAY['basic'::text, 'pro'::text])),
	CONSTRAINT "store_subscriptions_status_check" CHECK (status = ANY (ARRAY['created'::text, 'authenticated'::text, 'active'::text, 'pending'::text, 'halted'::text, 'cancelled'::text, 'completed'::text]))
);
--> statement-breakpoint
ALTER TABLE "store_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"custom_domain" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_no" integer DEFAULT nextval('store_no_seq'::regclass) NOT NULL,
	"plan_source" text DEFAULT 'comp' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	CONSTRAINT "stores_slug_key" UNIQUE("slug"),
	CONSTRAINT "stores_custom_domain_key" UNIQUE("custom_domain"),
	CONSTRAINT "stores_plan_check" CHECK (plan = ANY (ARRAY['free'::text, 'basic'::text, 'pro'::text])),
	CONSTRAINT "stores_plan_source_check" CHECK (plan_source = ANY (ARRAY['comp'::text, 'paid'::text, 'trial'::text])),
	CONSTRAINT "stores_status_check" CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'pending'::text]))
);
--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tax_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_classes_rate_range" CHECK ((rate >= (0)::numeric) AND (rate <= (100)::numeric))
);
--> statement-breakpoint
ALTER TABLE "tax_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'blue' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "user_groups_store_name_key" UNIQUE("name","store_id")
);
--> statement-breakpoint
ALTER TABLE "user_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "users_store_phone_key" UNIQUE("phone","store_id"),
	CONSTRAINT "users_store_email_key" UNIQUE("email","store_id")
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"store_id" uuid NOT NULL,
	"period" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_pkey" PRIMARY KEY("store_id","period")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "coupon_user_groups" (
	"coupon_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "coupon_user_groups_pkey" PRIMARY KEY("coupon_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "coupon_user_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "razorpay_plans" (
	"plan" text NOT NULL,
	"period" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"rzp_plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "razorpay_plans_pkey" PRIMARY KEY("plan","period","amount_paise"),
	CONSTRAINT "razorpay_plans_period_check" CHECK (period = ANY (ARRAY['monthly'::text, 'yearly'::text])),
	CONSTRAINT "razorpay_plans_plan_check" CHECK (plan = ANY (ARRAY['basic'::text, 'pro'::text]))
);
--> statement-breakpoint
ALTER TABLE "razorpay_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "user_group_members_pkey" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "user_group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "profiles_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_balances" ADD CONSTRAINT "ai_credit_balances_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_ledger" ADD CONSTRAINT "ai_credit_ledger_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_credit_purchases" ADD CONSTRAINT "ai_credit_purchases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_categories" ADD CONSTRAINT "blog_categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_blog_id_fkey" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_customer_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_likes" ADD CONSTRAINT "blog_likes_blog_id_fkey" FOREIGN KEY ("blog_id") REFERENCES "public"."blogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_likes" ADD CONSTRAINT "blog_likes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_tags" ADD CONSTRAINT "blog_tags_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_colors" ADD CONSTRAINT "card_colors_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_customer_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tax_class_id_fkey" FOREIGN KEY ("tax_class_id") REFERENCES "public"."tax_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_billing_settings" ADD CONSTRAINT "store_billing_settings_default_tax_class_id_fkey" FOREIGN KEY ("default_tax_class_id") REFERENCES "public"."tax_classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_billing_settings" ADD CONSTRAINT "store_billing_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_brand_profiles" ADD CONSTRAINT "store_brand_profiles_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_counters" ADD CONSTRAINT "store_counters_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_menus" ADD CONSTRAINT "store_menus_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_pages" ADD CONSTRAINT "store_pages_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payment_providers" ADD CONSTRAINT "store_payment_providers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_classes" ADD CONSTRAINT "tax_classes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_user_groups" ADD CONSTRAINT "coupon_user_groups_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_user_groups" ADD CONSTRAINT "coupon_user_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_user_groups" ADD CONSTRAINT "coupon_user_groups_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_customer_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admins_invited_by" ON "admins" USING btree ("invited_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_admins_store_id" ON "admins" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ai_credit_ledger_purchase_ref_idx" ON "ai_credit_ledger" USING btree ("kind" text_ops,"ref" text_ops) WHERE (kind = 'purchase'::text);--> statement-breakpoint
CREATE INDEX "ai_credit_ledger_store_idx" ON "ai_credit_ledger" USING btree ("store_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "ai_credit_purchases_pending_idx" ON "ai_credit_purchases" USING btree ("created_at" timestamptz_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "ai_credit_purchases_store_idx" ON "ai_credit_purchases" USING btree ("store_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_blog_categories_store_name" ON "blog_categories" USING btree (store_id text_ops,lower(name) text_ops);--> statement-breakpoint
CREATE INDEX "idx_blog_comments_blog" ON "blog_comments" USING btree ("blog_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_blog_comments_store_id" ON "blog_comments" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_blog_comments_user_id" ON "blog_comments" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_blog_likes_blog" ON "blog_likes" USING btree ("blog_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_blog_likes_store_id" ON "blog_likes" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_blog_tags_store_name" ON "blog_tags" USING btree (store_id text_ops,lower(name) text_ops);--> statement-breakpoint
CREATE INDEX "idx_blogs_categories_gin" ON "blogs" USING gin ("categories" array_ops) WHERE (status = 'published'::text);--> statement-breakpoint
CREATE INDEX "idx_blogs_created_at" ON "blogs" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_blogs_created_by" ON "blogs" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_blogs_customer_submissions" ON "blogs" USING btree ("submitted_by" uuid_ops) WHERE (is_customer_submission = true);--> statement-breakpoint
CREATE INDEX "idx_blogs_featured" ON "blogs" USING btree ("featured" bool_ops) WHERE (featured = true);--> statement-breakpoint
CREATE INDEX "idx_blogs_pending_review" ON "blogs" USING btree ("status" text_ops,"created_at" text_ops) WHERE (status = 'pending_review'::text);--> statement-breakpoint
CREATE INDEX "idx_blogs_published" ON "blogs" USING btree ("status" text_ops,"published_at" text_ops) WHERE (status = 'published'::text);--> statement-breakpoint
CREATE INDEX "idx_blogs_slug" ON "blogs" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_blogs_store_id" ON "blogs" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_blogs_submitted_created" ON "blogs" USING btree ("submitted_by" timestamptz_ops,"created_at" timestamptz_ops) WHERE (submitted_by IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_blogs_updated_by" ON "blogs" USING btree ("updated_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_card_colors_sort" ON "card_colors" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_card_colors_store_id" ON "card_colors" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_categories_slug" ON "categories" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_categories_sort" ON "categories" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_categories_store_id" ON "categories" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_coupons_code" ON "coupons" USING btree ("code" text_ops);--> statement-breakpoint
CREATE INDEX "idx_coupons_created_at" ON "coupons" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_coupons_created_by" ON "coupons" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_coupons_status" ON "coupons" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_coupons_store_id" ON "coupons" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_coupons_updated_by" ON "coupons" USING btree ("updated_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_customer_addresses_user" ON "customer_addresses" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ecr_campaign" ON "email_campaign_recipients" USING btree ("campaign_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ecr_pending" ON "email_campaign_recipients" USING btree ("created_at" timestamptz_ops) WHERE (status = 'pending'::text);--> statement-breakpoint
CREATE INDEX "idx_email_campaign_recipients_store_id" ON "email_campaign_recipients" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_email_campaigns_store_id" ON "email_campaigns" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_enquiries_created_at" ON "enquiries" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_enquiries_created_by" ON "enquiries" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_enquiries_status" ON "enquiries" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_enquiries_store_id" ON "enquiries" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_homepage_sections_order" ON "homepage_sections" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_homepage_sections_store_id" ON "homepage_sections" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_order_items_order_id" ON "order_items" USING btree ("order_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_orders_customer_id" ON "orders" USING btree ("customer_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_orders_store_created" ON "orders" USING btree ("store_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_orders_store_id" ON "orders" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "orders_pending_payment_idx" ON "orders" USING btree ("created_at" timestamptz_ops) WHERE ((payment_method = 'razorpay'::text) AND (payment_status = 'pending'::text));--> statement-breakpoint
CREATE UNIQUE INDEX "orders_razorpay_order_idx" ON "orders" USING btree ("razorpay_order_id" text_ops) WHERE (razorpay_order_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "orders_store_order_no_key" ON "orders" USING btree ("store_id" int4_ops,"order_no" int4_ops);--> statement-breakpoint
CREATE INDEX "plan_events_store_idx" ON "plan_events" USING btree ("store_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_product_reviews_product" ON "product_reviews" USING btree ("product_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_product_reviews_store_id" ON "product_reviews" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_product_reviews_user_created" ON "product_reviews" USING btree ("user_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_product_variants_store_id" ON "product_variants" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_variants_product" ON "product_variants" USING btree ("product_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_variants_stock" ON "product_variants" USING btree ("store_id" int4_ops,"stock" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "pv_store_sku_key" ON "product_variants" USING btree ("store_id" text_ops,"sku" text_ops);--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_products_created_at" ON "products" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_products_created_by" ON "products" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_products_featured" ON "products" USING btree ("featured" bool_ops) WHERE (featured = true);--> statement-breakpoint
CREATE INDEX "idx_products_low_stock" ON "products" USING btree ("store_id" int4_ops,"stock" uuid_ops) WHERE track_inventory;--> statement-breakpoint
CREATE INDEX "idx_products_published" ON "products" USING btree ("status" text_ops,"published_at" timestamptz_ops) WHERE (status = 'published'::text);--> statement-breakpoint
CREATE INDEX "idx_products_slug" ON "products" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_products_store_id" ON "products" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_products_store_sort" ON "products" USING btree ("store_id" int4_ops,"sort_order" uuid_ops,"created_at" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_products_tax_class" ON "products" USING btree ("tax_class_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_products_updated_by" ON "products" USING btree ("updated_by" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_sku_key" ON "products" USING btree ("store_id" text_ops,"sku" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_rate_limits_window" ON "rate_limits" USING btree ("window_start" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_roles_store_id" ON "roles" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_roles_store_name_lower" ON "roles" USING btree (store_id uuid_ops,lower(name) uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_stock_movements_sku" ON "stock_movements" USING btree ("product_id" timestamptz_ops,"variant_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_stock_movements_store" ON "stock_movements" USING btree ("store_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_store_pages_store" ON "store_pages" USING btree ("store_id" text_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "store_subscriptions_rzp_idx" ON "store_subscriptions" USING btree ("rzp_subscription_id" text_ops);--> statement-breakpoint
CREATE INDEX "stores_plan_expiry_idx" ON "stores" USING btree ("plan_expires_at" timestamptz_ops) WHERE (plan_expires_at IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "stores_store_no_key" ON "stores" USING btree ("store_no" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_tax_classes_store" ON "tax_classes" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tax_classes_store_name" ON "tax_classes" USING btree (store_id text_ops,lower(name) text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_groups_created_by" ON "user_groups" USING btree ("created_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_groups_name" ON "user_groups" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_groups_store_id" ON "user_groups" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_users_email_trgm" ON "users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_users_first_name_trgm" ON "users" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_users_last_name_trgm" ON "users" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_users_phone_trgm" ON "users" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_users_store_id" ON "users" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_coupon_user_groups_store_id" ON "coupon_user_groups" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cug_coupon" ON "coupon_user_groups" USING btree ("coupon_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cug_group" ON "coupon_user_groups" USING btree ("group_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ugm_group" ON "user_group_members" USING btree ("group_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_ugm_user" ON "user_group_members" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_group_members_added_by" ON "user_group_members" USING btree ("added_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_user_group_members_store_id" ON "user_group_members" USING btree ("store_id" uuid_ops);--> statement-breakpoint
CREATE VIEW "public"."customer_admin" AS (SELECT u.id, u.phone, u.email, u.first_name, u.last_name, u.created_at, u.updated_at, COALESCE(r.cnt, 0::bigint) AS review_count, COALESCE(b.cnt, 0::bigint) AS blog_count, COALESCE(r.cnt, 0::bigint) + COALESCE(b.cnt, 0::bigint) AS activity_count, u.store_id FROM users u LEFT JOIN ( SELECT product_reviews.user_id, count(*) AS cnt FROM product_reviews GROUP BY product_reviews.user_id) r ON r.user_id = u.id LEFT JOIN ( SELECT blogs.submitted_by, count(*) AS cnt FROM blogs WHERE blogs.is_customer_submission GROUP BY blogs.submitted_by) b ON b.submitted_by = u.id);--> statement-breakpoint
CREATE VIEW "public"."enquiry_admin" AS (SELECT id, name, email, phone, subject, message, status, created_by, created_at, updated_at, subject_detail, CASE status WHEN 'new'::text THEN 0 WHEN 'in_progress'::text THEN 1 WHEN 'resolved'::text THEN 2 WHEN 'archived'::text THEN 3 ELSE 4 END AS status_rank, store_id FROM enquiries e);--> statement-breakpoint
CREATE POLICY "Update admins" ON "admins" AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT is_store_superadmin(admins.store_id) AS is_store_superadmin) OR (( SELECT auth.uid() AS uid) = id)));--> statement-breakpoint
CREATE POLICY "Superadmins can insert profiles" ON "admins" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Superadmins can delete profiles" ON "admins" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Read admins" ON "admins" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Auth admin can read admins for token hook" ON "admins" AS PERMISSIVE FOR SELECT TO "supabase_auth_admin";--> statement-breakpoint
CREATE POLICY "Public can read blog categories" ON "blog_categories" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Admins can update blog categories" ON "blog_categories" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert blog categories" ON "blog_categories" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete blog categories" ON "blog_categories" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Customers can insert own comment" ON "blog_comments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND (users.store_id = blog_comments.store_id))))));--> statement-breakpoint
CREATE POLICY "Customers can delete own comment" ON "blog_comments" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Anyone can read blog comments" ON "blog_comments" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Anyone can read blog likes" ON "blog_likes" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Public can read blog tags" ON "blog_tags" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Admins can update blog tags" ON "blog_tags" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert blog tags" ON "blog_tags" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete blog tags" ON "blog_tags" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Update blogs" ON "blogs" AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text]))))) WITH CHECK ((( SELECT is_store_admin(blogs.store_id) AS is_store_admin) OR ((submitted_by = ( SELECT auth.uid() AS uid)) AND (is_customer_submission = true) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text])))));--> statement-breakpoint
CREATE POLICY "Read blogs" ON "blogs" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Insert blogs" ON "blogs" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Delete blogs" ON "blogs" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Anyone can read card_colors" ON "card_colors" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Admins can update card_colors" ON "card_colors" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert card_colors" ON "card_colors" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete card_colors" ON "card_colors" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Read categories" ON "categories" AS PERMISSIVE FOR SELECT TO public USING (((status = 'active'::text) OR ( SELECT is_store_admin(categories.store_id) AS is_store_admin)));--> statement-breakpoint
CREATE POLICY "Admins can update categories" ON "categories" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert categories" ON "categories" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete categories" ON "categories" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Read coupons" ON "coupons" AS PERMISSIVE FOR SELECT TO public USING (((status = 'active'::text) OR ( SELECT is_store_admin(coupons.store_id) AS is_store_admin)));--> statement-breakpoint
CREATE POLICY "Admins can update coupons" ON "coupons" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert coupons" ON "coupons" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete coupons" ON "coupons" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Customers delete own addresses" ON "customer_addresses" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Customers update own addresses" ON "customer_addresses" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Customers read own addresses" ON "customer_addresses" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Customers insert own addresses" ON "customer_addresses" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can read own enquiries" ON "enquiries" AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) = created_by));--> statement-breakpoint
CREATE POLICY "Users can insert own enquiry" ON "enquiries" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins read store enquiries" ON "enquiries" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Anyone can read homepage_sections" ON "homepage_sections" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Admins can update homepage_sections" ON "homepage_sections" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert homepage_sections" ON "homepage_sections" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete homepage_sections" ON "homepage_sections" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Customers can view own order items" ON "order_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((order_id IN ( SELECT orders.id
   FROM orders
  WHERE (orders.customer_id = auth.uid()))));--> statement-breakpoint
CREATE POLICY "Admins can view and manage store order items" ON "order_items" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Customers can view own orders" ON "orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((customer_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Admins can view and manage store orders" ON "orders" AS PERMISSIVE FOR ALL TO "authenticated";--> statement-breakpoint
CREATE POLICY "Update platform_admins" ON "platform_admins" AS PERMISSIVE FOR UPDATE TO public USING (( SELECT is_platform_superadmin() AS is_platform_superadmin)) WITH CHECK (( SELECT is_platform_superadmin() AS is_platform_superadmin));--> statement-breakpoint
CREATE POLICY "Read platform_admins" ON "platform_admins" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Insert platform_admins" ON "platform_admins" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Delete platform_admins" ON "platform_admins" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Customers can update own review" ON "product_reviews" AS PERMISSIVE FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));--> statement-breakpoint
CREATE POLICY "Customers can insert own review" ON "product_reviews" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Customers can delete own review" ON "product_reviews" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Anyone can read reviews" ON "product_reviews" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Read product_variants" ON "product_variants" AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM products
  WHERE ((products.id = product_variants.product_id) AND (products.status = 'published'::text)))) OR ( SELECT is_store_admin(product_variants.store_id) AS is_store_admin)));--> statement-breakpoint
CREATE POLICY "Admins can update variants" ON "product_variants" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert variants" ON "product_variants" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete variants" ON "product_variants" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Read products" ON "products" AS PERMISSIVE FOR SELECT TO public USING (((status = 'published'::text) OR ( SELECT is_store_admin(products.store_id) AS is_store_admin)));--> statement-breakpoint
CREATE POLICY "Admins can update products" ON "products" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins can insert products" ON "products" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins can delete products" ON "products" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Superadmins can update roles" ON "roles" AS PERMISSIVE FOR UPDATE TO public USING (( SELECT is_store_superadmin(roles.store_id) AS is_store_superadmin)) WITH CHECK (( SELECT is_store_superadmin(roles.store_id) AS is_store_superadmin));--> statement-breakpoint
CREATE POLICY "Superadmins can insert roles" ON "roles" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Superadmins can delete roles" ON "roles" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Authenticated can read roles" ON "roles" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Store admins can read stock_movements" ON "stock_movements" AS PERMISSIVE FOR SELECT TO public USING (( SELECT is_store_admin(stock_movements.store_id) AS is_store_admin));--> statement-breakpoint
CREATE POLICY "Store admins manage store_billing_settings" ON "store_billing_settings" AS PERMISSIVE FOR ALL TO public USING (( SELECT is_store_admin(store_billing_settings.store_id) AS is_store_admin)) WITH CHECK (( SELECT is_store_admin(store_billing_settings.store_id) AS is_store_admin));--> statement-breakpoint
CREATE POLICY "Anyone can read store_billing_settings" ON "store_billing_settings" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Store admins manage store_menus" ON "store_menus" AS PERMISSIVE FOR ALL TO public USING (( SELECT is_store_admin(store_menus.store_id) AS is_store_admin)) WITH CHECK (( SELECT is_store_admin(store_menus.store_id) AS is_store_admin));--> statement-breakpoint
CREATE POLICY "Anyone can read store_menus" ON "store_menus" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Public read published store_pages" ON "store_pages" AS PERMISSIVE FOR SELECT TO public USING (((status = 'published'::text) OR ( SELECT is_store_admin(store_pages.store_id) AS is_store_admin)));--> statement-breakpoint
CREATE POLICY "Admins update store_pages" ON "store_pages" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins insert store_pages" ON "store_pages" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins delete store_pages" ON "store_pages" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Update stores" ON "stores" AS PERMISSIVE FOR UPDATE TO public USING (( SELECT is_store_superadmin(stores.id) AS is_store_superadmin)) WITH CHECK (( SELECT is_store_superadmin(stores.id) AS is_store_superadmin));--> statement-breakpoint
CREATE POLICY "Read stores" ON "stores" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Insert stores" ON "stores" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Delete stores" ON "stores" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Store admins manage tax_classes" ON "tax_classes" AS PERMISSIVE FOR ALL TO public USING (( SELECT is_store_admin(tax_classes.store_id) AS is_store_admin)) WITH CHECK (( SELECT is_store_admin(tax_classes.store_id) AS is_store_admin));--> statement-breakpoint
CREATE POLICY "Anyone can read tax_classes" ON "tax_classes" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Admins update user_groups" ON "user_groups" AS PERMISSIVE FOR UPDATE TO public USING (( SELECT is_store_admin(user_groups.store_id) AS is_store_admin)) WITH CHECK (( SELECT is_store_admin(user_groups.store_id) AS is_store_admin));--> statement-breakpoint
CREATE POLICY "Admins insert user_groups" ON "user_groups" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins delete user_groups" ON "user_groups" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Admins can read user_groups" ON "user_groups" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Customers can update own row" ON "users" AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));--> statement-breakpoint
CREATE POLICY "Customers can read own row" ON "users" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Customers can insert own row" ON "users" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Auth admin can read users for token hook" ON "users" AS PERMISSIVE FOR SELECT TO "supabase_auth_admin";--> statement-breakpoint
CREATE POLICY "Public can read coupon group links" ON "coupon_user_groups" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Admins update coupon group links" ON "coupon_user_groups" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins insert coupon group links" ON "coupon_user_groups" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins delete coupon group links" ON "coupon_user_groups" AS PERMISSIVE FOR DELETE TO public;--> statement-breakpoint
CREATE POLICY "Read memberships" ON "user_group_members" AS PERMISSIVE FOR SELECT TO public USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_store_admin(user_group_members.store_id) AS is_store_admin)));--> statement-breakpoint
CREATE POLICY "Admins update memberships" ON "user_group_members" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Admins insert memberships" ON "user_group_members" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Admins delete memberships" ON "user_group_members" AS PERMISSIVE FOR DELETE TO public;
*/