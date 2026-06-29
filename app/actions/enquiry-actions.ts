"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { sendEnquiryAcknowledgementEmail } from "@/lib/email/enquiry-notifications";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export type EnquiryStatus = "new" | "in_progress" | "resolved" | "archived";

// Note: a "use server" module may only export async functions (+ type-only
// exports), so the valid-status list lives inside the action below rather than
// as an exported const.

export interface EnquiryInput {
  name: string;
  email: string;
  phone: string;
  subject?: string;
  subjectDetail?: string;
  message: string;
}

export interface ActionResult {
  success?: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Storefront submission. Enquiries are ANONYMOUS — the enquirer is never logged
 * in and no customer account is created. The phone is verified client-side via
 * a throwaway (non-persisting) OTP client before this runs; here we simply store
 * what was submitted using the service-role admin client (so no auth session is
 * required). Sends a best-effort acknowledgement email and never blocks success
 * on it.
 */
export async function submitEnquiry(
  input: EnquiryInput,
): Promise<ActionResult> {
  const name = input.name?.trim();
  const email = input.email?.trim();
  const phone = input.phone?.trim();
  const subject = input.subject?.trim() || null;
  const subjectDetail = input.subjectDetail?.trim() || null;
  const message = input.message?.trim();

  if (!name) return { error: "Please enter your name." };
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (!phone || phone.replace(/\D/g, "").length < 8) {
    return { error: "A verified phone number is required." };
  }
  if (!subject) return { error: "Please select a subject." };
  if (!message) return { error: "Please enter a message." };

  // Anonymous public endpoint — throttle per IP so it can't be used to spam
  // the inbox (and our acknowledgement-email quota). 5 submissions / hour.
  const ip = clientIp(await headers());
  const { allowed } = await rateLimit(`enquiry:${ip}`, {
    max: 5,
    windowSeconds: 3600,
  });
  if (!allowed) {
    return {
      error: "Too many enquiries from your network. Please try again later.",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("enquiries").insert({
    name,
    email,
    phone,
    subject,
    subject_detail: subjectDetail,
    message,
  });

  if (error) {
    console.error("Failed to insert enquiry:", error);
    return {
      error: "Something went wrong saving your enquiry. Please try again.",
    };
  }

  // The customer sees their real subject in the email; for "Other" that's the
  // free-text they typed (the dashboard list shows just "Other").
  const emailSubject =
    subject === "Other" && subjectDetail ? subjectDetail : subject;

  // Best-effort acknowledgement — failure is logged inside, never thrown.
  await sendEnquiryAcknowledgementEmail({
    to: email,
    name,
    subject: emailSubject,
    message,
  });

  revalidatePath("/dashboard/enquiries");
  return { success: true };
}

/** Dashboard: change an enquiry's workflow status. */
export async function updateEnquiryStatus(
  id: string,
  status: EnquiryStatus,
): Promise<ActionResult> {
  const managerId = await getManagerUserId("enquiries");
  if (!managerId) {
    return { error: "You don't have permission to manage enquiries." };
  }
  const validStatuses: EnquiryStatus[] = [
    "new",
    "in_progress",
    "resolved",
    "archived",
  ];
  if (!validStatuses.includes(status)) {
    return { error: "Invalid status." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("enquiries")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("Failed to update enquiry status:", error);
    return { error: "Failed to update status. Please try again." };
  }

  revalidatePath("/dashboard/enquiries");
  return { success: true };
}

/** Dashboard: permanently delete an enquiry. */
export async function deleteEnquiry(id: string): Promise<ActionResult> {
  const managerId = await getManagerUserId("enquiries");
  if (!managerId) {
    return { error: "You don't have permission to manage enquiries." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("enquiries").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete enquiry:", error);
    return { error: "Failed to delete enquiry. Please try again." };
  }

  revalidatePath("/dashboard/enquiries");
  return { success: true };
}
