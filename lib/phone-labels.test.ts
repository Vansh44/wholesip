import { describe, it, expect } from "vitest";
import { getCountries } from "react-phone-number-input";
import { customPhoneLabels } from "./phone-labels";

// customPhoneLabels powers the country-select dropdown in phone-input fields:
// it takes react-phone-number-input's plain country names and appends the
// dialling code, so users see "India +91" instead of just "India".
describe("customPhoneLabels", () => {
  // It's a plain string->string record.
  it("is a record of string labels", () => {
    expect(typeof customPhoneLabels).toBe("object");
    expect(customPhoneLabels).not.toBeNull();
    for (const value of Object.values(customPhoneLabels)) {
      expect(typeof value).toBe("string");
    }
  });

  // India must carry its +91 calling code (the storefront's default market).
  it("includes the +91 dialling code for IN", () => {
    expect(customPhoneLabels.IN).toContain("+91");
  });

  // US must carry +1.
  it("includes the +1 dialling code for US", () => {
    expect(customPhoneLabels.US).toContain("+1");
  });

  // Every country react-phone-number-input knows about must have a label, so
  // the dropdown never renders a blank/undefined option.
  it("has an entry for every supported country", () => {
    for (const country of getCountries()) {
      expect(customPhoneLabels[country]).toBeTruthy();
      expect(typeof customPhoneLabels[country]).toBe("string");
    }
  });
});
