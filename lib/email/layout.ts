import { siteConfig } from "@/config/site";

/**
 * Wraps email body content in the shared WholeSip branded layout.
 *
 * Returns a full HTML document that forces a light color scheme: the
 * `color-scheme` / `supported-color-schemes` meta + CSS tell clients the email
 * only supports light mode, so they won't apply the device's dark theme and
 * invert the white background to black. `bgcolor` attributes back this up for
 * clients that ignore the meta. (A few clients with aggressive forced dark mode
 * can still override this — a known email limitation.)
 *
 * `bodyHtml` is dropped into the white content cell — include your own sign-off.
 */
export function wrapBrandedEmail(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <style>
      :root {
        color-scheme: light only;
        supported-color-schemes: light only;
      }
      body {
        margin: 0;
        padding: 0;
        background-color: #f4f4f5;
      }
    </style>
  </head>
  <body bgcolor="#f4f4f5" style="margin:0; padding:0; background-color:#f4f4f5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4f5" style="background-color:#f4f4f5; margin:0; padding:0;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%; max-width:600px; background-color:#ffffff; border:1px solid #e5e5e5; border-radius:12px; overflow:hidden;">
            <tr>
              <td align="center" bgcolor="#ffffff" style="background-color:#ffffff; padding:28px 24px; border-bottom:1px solid #f0f0f0;">
                <img
                  src="${siteConfig.assets.logoUrl}"
                  alt="WholeSip"
                  width="140"
                  style="display:block; width:140px; max-width:55%; height:auto;"
                />
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" style="background-color:#ffffff; padding:32px 28px; font-family:Arial, sans-serif; color:#333333; font-size:15px; line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
