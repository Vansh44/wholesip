"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveStoreSettings,
  type EditorSetting,
} from "@/app/actions/store-settings";

function Toggle({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-emerald-500" : "bg-[rgba(17,24,39,0.18)]"
      } ${disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function FeatureSettingsView({
  plan,
  initialSettings,
  canManage,
}: {
  plan: string;
  initialSettings: EditorSetting[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialSettings.map((s) => [s.key, s.value])),
  );

  const groups = useMemo(() => {
    const byGroup = new Map<string, EditorSetting[]>();
    for (const s of initialSettings) {
      const list = byGroup.get(s.group) ?? [];
      list.push(s);
      byGroup.set(s.group, list);
    }
    return Array.from(byGroup.entries());
  }, [initialSettings]);

  const dirty = initialSettings.some((s) => values[s.key] !== s.value);

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveStoreSettings(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Feature settings saved.");
      router.refresh();
    });
  };

  return (
    <div className="dash-page-enter mx-auto w-full max-w-3xl">
      <header className="dash-page-header">
        <h1>Features</h1>
        <p>
          Turn store features on or off — your storefront updates immediately.
        </p>
      </header>

      <div className="mt-4 space-y-5">
        {groups.map(([group, settings]) => (
          <section key={group} className="dash-card">
            <div className="dash-card-header">
              <div>
                <div className="dash-card-title">{group}</div>
              </div>
            </div>
            <div className="dash-card-body">
              <ul className="divide-y divide-[rgba(17,24,39,0.06)]">
                {settings.map((s) => {
                  // A dependent setting only applies while its parent is on.
                  const parentOff =
                    s.dependsOn !== undefined && values[s.dependsOn] === false;
                  const disabled =
                    !canManage || s.locked || isPending || parentOff;
                  return (
                    <li
                      key={s.key}
                      className={`flex items-start justify-between gap-6 py-4 first:pt-1 last:pb-1 ${
                        parentOff ? "opacity-55" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {s.label}
                          {s.locked && (
                            <span className="dash-badge-amber inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                              <Lock className="h-3 w-3" />
                              {s.minPlan
                                ? `${s.minPlan} plan and above`
                                : "Locked"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-[#5b6472]">
                          {s.description}
                        </p>
                      </div>
                      <Toggle
                        on={values[s.key]}
                        disabled={disabled}
                        label={s.label}
                        onChange={(next) =>
                          setValues((v) => ({ ...v, [s.key]: next }))
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>

      {canManage && (
        <div className="mt-5 flex items-center justify-end gap-3">
          <span className="text-xs text-[#8b93a3]">
            Current plan: <strong>{plan}</strong>
          </span>
          <Button onClick={handleSave} disabled={!dirty || isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
