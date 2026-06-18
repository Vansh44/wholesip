import en from "react-phone-number-input/locale/en.json";
import { getCountries, getCountryCallingCode } from "react-phone-number-input";

export const customPhoneLabels: Record<string, string> = { ...en };

getCountries().forEach((country) => {
  customPhoneLabels[country] =
    `${en[country]} +${getCountryCallingCode(country)}`;
});
