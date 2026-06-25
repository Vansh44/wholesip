import { wrapBrandedEmail } from "./layout";

/** Escape user / AI supplied values before interpolating into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Merge per-recipient tokens into a subject or body string. */
export function mergeTokens(text: string, firstName: string): string {
  const name = firstName.trim() || "there";
  return text.replace(/\{\{\s*(first_name|name)\s*\}\}/gi, name);
}

export type CouponEmailContent = {
  /** AI- or hand-written body. Plain text; blank lines separate paragraphs.
   *  May contain the {{first_name}} merge tag. */
  body: string;
  /** Recipient's first name used to resolve {{first_name}}. */
  firstName: string;
  code: string;
  discountLabel: string;
  validUntilLabel?: string | null;
};

// Turn the body into safe HTML: escape first (so merged names / copy can't
// inject markup), merge the recipient's name, then split blank-line-separated
// blocks into <p> paragraphs with <br> for single newlines.
function bodyToHtml(body: string, firstName: string): string {
  const merged = mergeTokens(escapeHtml(body), firstName);
  return merged
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin:0 0 16px;">${para.replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n");
}

// The shared coupon promo block: a centred box with the code, discount and
// (optionally) the expiry. Rendered by us so every campaign looks consistent
// regardless of what the copy says.
function couponBox(
  code: string,
  discountLabel: string,
  validUntilLabel?: string | null,
): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
    <tr>
      <td align="center" style="padding:8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f5; border:1px dashed #c7bfb3; border-radius:10px;">
          <tr>
            <td align="center" style="padding:20px 32px;">
              <div style="font-size:13px; color:#8a8175; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">${escapeHtml(discountLabel)}</div>
              <div style="font-size:26px; font-weight:700; letter-spacing:2px; color:#1f2937; font-family:'Courier New', monospace;">${escapeHtml(code)}</div>
              ${
                validUntilLabel
                  ? `<div style="font-size:12px; color:#9a9183; margin-top:8px;">Valid until ${escapeHtml(validUntilLabel)}</div>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

/** Inner body HTML (greeting copy + promo box + sign-off), before wrapping. */
export function renderCouponEmailBody(content: CouponEmailContent): string {
  return `${bodyToHtml(content.body, content.firstName)}
${couponBox(content.code, content.discountLabel, content.validUntilLabel)}
<p style="margin-top:28px;">
  Warm regards,<br />
  <strong>Team WholeSip</strong>
</p>`;
}

/** Full, send-ready HTML document for one recipient. */
export function renderCouponEmail(content: CouponEmailContent): string {
  return wrapBrandedEmail(renderCouponEmailBody(content));
}
