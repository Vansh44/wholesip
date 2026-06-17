"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ui/image-upload";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
};

export function MediaPickerDialog({ open, onClose, onSelect }: Props) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Choose cover image</DialogTitle>
          <DialogDescription>
            Upload an image to use as the blog cover photo.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <ImageUpload
            folder="blog-covers"
            onUploadSuccess={(url) => {
              if (url) {
                onSelect(url);
              }
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
