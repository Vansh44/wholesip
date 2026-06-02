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
      <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[#e8ecf4]">
            Choose Cover Image
          </DialogTitle>
          <DialogDescription className="text-[#8b93a8]">
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
