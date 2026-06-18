import React from "react";
import { getCountryCallingCode, Country } from "react-phone-number-input";

interface CountrySelectOption {
  value?: string;
  label: string;
}

interface CountrySelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  iconComponent?: React.ElementType;
  value?: string;
  options: CountrySelectOption[];
}

export const CountrySelect = ({
  iconComponent: Icon,
  value,
  options,
  ...rest
}: CountrySelectProps) => {
  return (
    <div className="relative flex items-center h-full px-2 cursor-pointer">
      {Icon && <Icon country={value} label={value} />}
      <span className="text-sm font-medium text-foreground ml-1 mr-4">
        {value ? `+${getCountryCallingCode(value as Country)}` : ""}
      </span>
      <select
        {...rest}
        value={value || ""}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map((option) => (
          <option key={option.value || "ZZ"} value={option.value || ""}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="absolute right-2 pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
};
