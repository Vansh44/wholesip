"use server";

import { revalidateTag } from "next/cache";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import { STORE_TAG } from "@/lib/store/resolve";

export interface DomainResult {
  success?: boolean;
  error?: string;
}

export interface DomainStatus {
  id: string;
  name: string;
  status: string; // 'pending', 'verified', 'failed', 'temporary_failure', 'not_started'
  records?: Array<{
    record: string;
    name: string;
    type: string;
    ttl: string;
    status: string;
    value: string;
    priority?: number;
  }>;
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.includes("placeholder")) return null;
  return new Resend(apiKey);
}

function clean(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s ? s : null;
}

/**
 * Retrieves the current custom domain and its resend verification status (if available).
 */
export async function getCustomDomainDetails(): Promise<{
  domain: string | null;
  resendDomainId: string | null;
}> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();

  const { data } = await admin
    .from("stores")
    .select("custom_domain, settings")
    .eq("id", storeId)
    .single();

  const settings = (data?.settings as Record<string, unknown>) ?? {};
  return {
    domain: data?.custom_domain ?? null,
    resendDomainId: (settings.resend_domain_id as string) ?? null,
  };
}

/**
 * Updates the custom domain for the store. Also registers it with Resend.
 */
export async function updateCustomDomain(
  domainName: string | null,
): Promise<DomainResult> {
  const storeId = await getActingStoreId();
  const admin = createAdminClient();
  const cleanDomain = clean(domainName);

  // 1. Get existing info
  const { data: store } = await admin
    .from("stores")
    .select("custom_domain, settings")
    .eq("id", storeId)
    .single();

  const settings = ((store?.settings as Record<string, unknown>) ??
    {}) as Record<string, unknown>;
  const oldResendId = settings.resend_domain_id as string | undefined;

  const resend = getResend();

  // 2. Remove old domain from resend if one exists and we have resend enabled
  if (oldResendId && resend) {
    try {
      await resend.domains.remove(oldResendId);
    } catch (e) {
      console.warn("Failed to remove old domain from Resend:", e);
    }
  }

  // 3. Register new domain with Resend (if a new one is provided)
  let newResendId: string | null = null;
  if (cleanDomain && resend) {
    try {
      const { data, error } = await resend.domains.create({
        name: cleanDomain,
      });
      if (error) {
        return { error: `Resend error: ${error.message}` };
      }
      if (data) {
        newResendId = data.id;
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to create domain on Resend.";
      return { error: msg };
    }
  } else if (cleanDomain && !resend) {
    return { error: "Resend API key is not configured." };
  }

  // 4. Update the DB
  const newSettings = { ...settings };
  if (newResendId) {
    newSettings.resend_domain_id = newResendId;
  } else {
    delete newSettings.resend_domain_id;
  }

  const { error } = await admin
    .from("stores")
    .update({
      custom_domain: cleanDomain,
      settings: newSettings,
    })
    .eq("id", storeId);

  if (error) {
    return { error: "Failed to save domain in database." };
  }

  revalidateTag(STORE_TAG, "max");
  return { success: true };
}

/**
 * Gets the current status and DNS records for the domain from Resend.
 */
export async function getResendDomainStatus(
  resendDomainId: string,
): Promise<{ status?: DomainStatus; error?: string }> {
  const resend = getResend();
  if (!resend) return { error: "Resend API key not configured." };

  try {
    const { data, error } = await resend.domains.get(resendDomainId);
    if (error) return { error: error.message };
    if (!data) return { error: "Domain not found on Resend." };

    return { status: data as DomainStatus };
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? e.message : "Failed to fetch domain status.";
    return { error: msg };
  }
}

/**
 * Triggers a DNS verification check on Resend.
 */
export async function verifyResendDomain(
  resendDomainId: string,
): Promise<DomainResult> {
  const resend = getResend();
  if (!resend) return { error: "Resend API key not configured." };

  try {
    const { error } = await resend.domains.verify(resendDomainId);
    if (error) return { error: error.message };

    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to verify domain.";
    return { error: msg };
  }
}
