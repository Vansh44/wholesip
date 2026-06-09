import { Resend } from "resend";
import { wrapBrandedEmail } from "./layout";

// Public site origin used to build links inside emails. Falls back to the
// production domain (matches the hardcoded link in invite-user.ts).
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://getsoakd.in"
).replace(/\/$/, "");

const FROM_ADDRESS = "Soakd <admin@getsoakd.in>";

/** Escape user-supplied values before interpolating into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  // Mirror invite-user.ts: skip sending when the key is missing or a
  // placeholder so local/dev environments don't error out.
  if (!apiKey || apiKey.includes("placeholder")) return null;
  return new Resend(apiKey);
}

/** Wraps blog email body content in the shared branded layout + sign-off. */
function emailShell(bodyHtml: string): string {
  return wrapBrandedEmail(`${bodyHtml}
    <p style="margin-top:32px;">
      Warm regards,<br />
      <strong>Team Soakd</strong>
    </p>`);
}

function greeting(firstName: string | null): string {
  return firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";
}

/**
 * Sends a congratulations email to a customer whose blog was approved and
 * published, including a link to the live post. Best-effort: never throws, so
 * a mail failure can't roll back the approval.
 */
export async function sendBlogApprovedEmail(opts: {
  to: string;
  firstName: string | null;
  title: string;
  slug: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(
      `📨 [blog approved] email skipped (Resend not configured) — to: ${opts.to}, blog: ${opts.title}`,
    );
    return;
  }

  const blogUrl = `${SITE_URL}/pages/blogs/${opts.slug}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: `🎉 Your blog "${opts.title}" is now live on Soakd!`,
      html: emailShell(`
        <h2 style="margin-top: 0;">Congratulations! 🎉</h2>
        <p>${greeting(opts.firstName)}</p>
        <p>
          Great news — your blog
          <strong>"${escapeHtml(opts.title)}"</strong> has been reviewed and
          approved by our team. It's now published and live on the Soakd
          journal for everyone to read.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a
            href="${blogUrl}"
            style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600;"
          >
            Read Your Published Blog
          </a>
        </div>
        <p>
          Thank you for sharing your story with the Soakd community. We can't
          wait to see what you write next!
        </p>
      `),
    });
    // Resend returns errors in the response body rather than throwing, so a
    // bad request / rejected recipient would otherwise fail silently.
    if (error) {
      console.error("Resend rejected blog-approved email:", error);
    } else {
      console.log(
        `📨 [blog approved] email sent (id: ${data?.id}) — to: ${opts.to}`,
      );
    }
  } catch (e) {
    console.error("Failed to send blog-approved email via Resend:", e);
  }
}

/**
 * Sends a notification to a customer whose blog submission was not approved.
 * Best-effort: never throws.
 */
export async function sendBlogRejectedEmail(opts: {
  to: string;
  firstName: string | null;
  title: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(
      `📨 [blog rejected] email skipped (Resend not configured) — to: ${opts.to}, blog: ${opts.title}`,
    );
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: `Update on your Soakd blog submission`,
      html: emailShell(`
        <h2 style="margin-top: 0;">About your blog submission</h2>
        <p>${greeting(opts.firstName)}</p>
        <p>
          Thank you for submitting your blog
          <strong>"${escapeHtml(opts.title)}"</strong> to Soakd. After review,
          our team has decided not to publish it at this time.
        </p>
        <p>
          Please don't be discouraged — you're welcome to revise your ideas and
          submit a new blog whenever you'd like. We'd love to hear more from
          you.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a
            href="${SITE_URL}/pages/blogs/write"
            style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600;"
          >
            Write Another Blog
          </a>
        </div>
      `),
    });
    if (error) {
      console.error("Resend rejected blog-rejected email:", error);
    } else {
      console.log(
        `📨 [blog rejected] email sent (id: ${data?.id}) — to: ${opts.to}`,
      );
    }
  } catch (e) {
    console.error("Failed to send blog-rejected email via Resend:", e);
  }
}
