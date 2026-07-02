"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import {
  updateCustomDomain,
  verifyResendDomain,
  getResendDomainStatus,
  type DomainStatus,
} from "@/app/actions/store-domain";

export function DomainSettingsView({
  initialDomain,
  initialResendDomainId,
  initialStatus,
}: {
  initialDomain: string | null;
  initialResendDomainId: string | null;
  initialStatus: DomainStatus | null;
}) {
  const [domain, setDomain] = useState(initialDomain || "");
  const [resendDomainId, setResendDomainId] = useState(initialResendDomainId);
  const [status, setStatus] = useState(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // Check if domain is just empty string and change to null
    const valToSave = domain.trim() === "" ? null : domain.trim();

    const result = await updateCustomDomain(valToSave);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Domain settings updated.");
      // If we cleared the domain, reset status
      if (!valToSave) {
        setStatus(null);
        setResendDomainId(null);
      } else {
        // Need to reload the page to get the new status and records from the server
        window.location.reload();
      }
    }
    setIsSaving(false);
  };

  const handleVerify = async () => {
    if (!resendDomainId) return;
    setIsVerifying(true);
    const result = await verifyResendDomain(resendDomainId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Verification check initiated.");
      // Re-fetch status to see if it changed
      const updatedStatus = await getResendDomainStatus(resendDomainId);
      if (updatedStatus.status) {
        setStatus(updatedStatus.status);
      }
    }
    setIsVerifying(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#111827]">Domain Settings</h1>
        <p className="mt-1 text-sm text-[#5b6472]">
          Connect a custom domain to your store for branded emails and
          storefront access.
        </p>
      </div>

      <div className="rounded-xl border border-[rgba(17,24,39,0.08)] bg-white shadow-sm">
        <form onSubmit={handleSave} className="p-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="domain"
                className="mb-1.5 block text-sm font-medium text-[#344054]"
              >
                Custom Domain
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="domain"
                  name="domain"
                  type="text"
                  placeholder="e.g. yourstore.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="dash-input max-w-md"
                />
                <button
                  type="submit"
                  disabled={isSaving || domain === initialDomain}
                  className="dash-btn dash-btn-primary"
                >
                  {isSaving ? "Saving..." : "Save Domain"}
                </button>
              </div>
              <p className="mt-2 text-sm text-[#5b6472]">
                Leave empty to use your default store link.
              </p>
            </div>
          </div>
        </form>
      </div>

      {status && (
        <div className="rounded-xl border border-[rgba(17,24,39,0.08)] bg-white shadow-sm">
          <div className="border-b border-[rgba(17,24,39,0.08)] p-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-[#111827]">
                Email Verification Status
              </h2>
              <p className="mt-1 text-sm text-[#5b6472]">
                To send emails from @{domain}, you must verify your domain.
              </p>
            </div>
            <div>
              {status.status === "verified" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                  <CheckCircle2 className="h-4 w-4" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  <AlertCircle className="h-4 w-4" /> {status.status}
                </span>
              )}
            </div>
          </div>

          <div className="p-6">
            {status.status === "verified" ? (
              <div className="rounded-md bg-green-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <CheckCircle2
                      className="h-5 w-5 text-green-400"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      Domain successfully verified
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>
                        Your domain has been verified. Emails will now be sent
                        from your custom domain.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md bg-amber-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertCircle
                        className="h-5 w-5 text-amber-400"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-amber-800">
                        Verification Pending
                      </h3>
                      <div className="mt-2 text-sm text-amber-700">
                        <p>
                          Please add the following DNS records to your domain
                          registrar&apos;s settings. It can take up to 72 hours
                          for DNS changes to propagate.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {status.records && status.records.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-lg border border-[rgba(17,24,39,0.08)] bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-[#fcfcfc]">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#5b6472]"
                          >
                            Type
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#5b6472]"
                          >
                            Name
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#5b6472]"
                          >
                            Value
                          </th>
                          <th scope="col" className="relative px-6 py-3">
                            <span className="sr-only">Copy</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(17,24,39,0.08)] bg-white text-sm">
                        {status.records.map((record, idx) => (
                          <tr key={idx}>
                            <td className="whitespace-nowrap px-6 py-4 font-mono font-medium text-[#111827]">
                              {record.type}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 font-mono text-[#5b6472]">
                              {record.name}
                            </td>
                            <td className="px-6 py-4 font-mono text-[#5b6472]">
                              <div
                                className="max-w-[300px] truncate"
                                title={record.value}
                              >
                                {record.value}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                              <button
                                type="button"
                                onClick={() => copyToClipboard(record.value)}
                                className="text-amber-600 hover:text-amber-900"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="dash-btn dash-btn-outline flex items-center gap-2"
                  >
                    {isVerifying ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Verify DNS Records
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
