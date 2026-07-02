/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createSection, updateSection } from "@/app/actions/homepage-actions";
import {
  EMPTY_CONFIG,
  SECTION_TYPE_META,
  type AnySectionConfig,
  type HomepageSection,
  type HomepageSectionType,
} from "@/lib/homepage/section-types";
import { SectionForm } from "@/app/dashboard/builder/section-form";
import type { BlogOption, CategoryOption, ProductOption } from "./page";

type Props = {
  open: boolean;
  section: HomepageSection | null; // edit mode
  createType: HomepageSectionType | null; // create mode
  products: ProductOption[];
  categories: CategoryOption[];
  blogs: BlogOption[];
  onClose: () => void;
  onSaved: () => void;
};

export function SectionEditorDialog({
  open,
  section,
  createType,
  products,
  categories,
  blogs,
  onClose,
  onSaved,
}: Props) {
  const isEditing = !!section;
  const type: HomepageSectionType | null = section?.type ?? createType;

  const [config, setConfig] = useState<AnySectionConfig | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !type) return;
    if (section) {
      setConfig(section.config);
    } else {
      // structuredClone keeps the EMPTY_CONFIG template pristine.
      setConfig(structuredClone(EMPTY_CONFIG[type]));
    }
  }, [open, section, type]);

  if (!type || !config) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[560px]" />
      </Dialog>
    );
  }

  const meta = SECTION_TYPE_META[type];

  const handleSave = () => {
    startTransition(async () => {
      const result = isEditing
        ? await updateSection(section!.id, config)
        : await createSection(type, config);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Section updated" : "Section added");
        onSaved();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit" : "New"} · {meta.label}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <SectionForm
            type={type}
            config={config}
            setConfig={setConfig}
            products={products}
            categories={categories}
            blogs={blogs}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Add Section"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
