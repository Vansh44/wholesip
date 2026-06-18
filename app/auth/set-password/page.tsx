"use client";

import { useState, useTransition, useEffect } from "react";
import { setPassword } from "@/app/actions/set-password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { customPhoneLabels } from "@/lib/phone-labels";
import { CountrySelect } from "@/components/ui/phone-country-select";

function getPasswordStrength(password: string) {
  if (password.length === 0) return null;
  if (password.length < 8)
    return { label: "Too short", color: "bg-red-500", width: "w-1/3" };
  if (password.length < 12)
    return { label: "Fair", color: "bg-yellow-500", width: "w-2/3" };
  return { label: "Strong", color: "bg-green-500", width: "w-full" };
}

export default function SetPasswordPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPasswordVal] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Phone & OTP states
  const [phone, setPhone] = useState<string | undefined>("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [loadingOtp, setLoadingOtp] = useState(false);

  const strength = getPasswordStrength(password);
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const fullPhone = phone || "";

  useEffect(() => {
    async function fetchProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone")
          .eq("id", user.id)
          .single();
        if (profile) {
          setFirstName(profile.first_name || "");
          setLastName(profile.last_name || "");
          // If phone exists we could technically pre-fill it, but let's assume they have to verify a new one
          // or we can just leave it blank if they haven't verified.
        }
      }
    }
    fetchProfile();
  }, []);

  const handleSendOtp = async () => {
    if (!phone || phone.length < 10) {
      setOtpError("Please enter a valid phone number.");
      return;
    }

    setOtpError("");
    setLoadingOtp(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ phone: fullPhone });

    if (error) {
      setOtpError(error.message);
    } else {
      setOtpSent(true);
      setOtpError("");
    }
    setLoadingOtp(false);
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6) {
      setOtpError("Please enter the 6-digit OTP.");
      return;
    }

    setOtpError("");
    setLoadingOtp(true);
    const supabase = createClient();

    const { error } = await supabase.auth.verifyOtp({
      phone: fullPhone,
      token: otp,
      type: "phone_change",
    });

    if (error) {
      setOtpError(error.message);
    } else {
      setIsPhoneVerified(true);
      setOtpError("");
    }
    setLoadingOtp(false);
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }

    if (!isPhoneVerified) {
      setError("Please verify your phone number before setting your password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const formData = new FormData();
    formData.set("password", password);
    formData.set("confirmPassword", confirmPassword);
    formData.set("firstName", firstName);
    formData.set("lastName", lastName);
    formData.set("phone", fullPhone);

    startTransition(async () => {
      const result = await setPassword(formData);
      if (result?.error) {
        setError(result.error);
      }
      // On success, the server action redirects to /dashboard
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-bold">
          Complete your profile
        </CardTitle>
        <CardDescription>
          Please verify your details and set a secure password
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                placeholder="First name"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Last name (optional)"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <PhoneInput
              defaultCountry="IN"
              countrySelectComponent={CountrySelect}
              labels={customPhoneLabels}
              placeholder="Mobile number"
              value={phone}
              onChange={setPhone}
              disabled={isPhoneVerified || otpSent}
              inputComponent={Input}
              className="flex gap-2 [&>.PhoneInputCountry]:h-10 [&>.PhoneInputCountry]:rounded-md [&>.PhoneInputCountry]:border [&>.PhoneInputCountry]:border-input [&>.PhoneInputCountry]:bg-background [&>.PhoneInputCountry]:p-0"
            />

            {!isPhoneVerified && (
              <div className="mt-1">
                {!otpSent ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleSendOtp}
                    disabled={loadingOtp || !phone || phone.length < 10}
                  >
                    {loadingOtp ? "Sending..." : "Send OTP"}
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      OTP sent to {fullPhone}.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setOtp("");
                        }}
                        className="text-primary underline"
                      >
                        Edit
                      </button>
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="Enter 6-digit OTP"
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        maxLength={6}
                      />
                      <Button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={loadingOtp || otp.length < 6}
                      >
                        {loadingOtp ? "Verifying..." : "Verify"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isPhoneVerified && (
              <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Phone Number Verified
              </p>
            )}

            {otpError && <p className="text-sm text-destructive">{otpError}</p>}
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimum 8 characters"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPasswordVal(e.target.value)}
              autoComplete="new-password"
            />
            {strength && (
              <div className="flex flex-col gap-1">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {strength.label}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            {mismatch && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !isPhoneVerified}
          >
            {isPending ? "Setting up account…" : "Complete Setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
