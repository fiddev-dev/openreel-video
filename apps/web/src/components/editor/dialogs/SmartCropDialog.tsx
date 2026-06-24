import React from "react";
import { Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@openreel/ui";
import { AutoReframeSection } from "../inspector/AutoReframeSection";

interface SmartCropDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  clipId: string;
}

export const SmartCropDialog: React.FC<SmartCropDialogProps> = ({
  isOpen,
  onOpenChange,
  clipId,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background-secondary border-border p-6 overflow-y-auto">
        <DialogHeader className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Smartphone size={20} />
            </div>
            <div>
              <DialogTitle className="text-text-primary text-base font-bold">Smart Face Cropping</DialogTitle>
              <DialogDescription className="text-text-muted text-xs mt-0.5">
                Automatically tracks faces using MediaPipe and keeps them centered in the reframed video.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2">
          {clipId ? (
            <AutoReframeSection
              clipId={clipId}
              onReframeComplete={() => onOpenChange(false)}
            />
          ) : (
            <p className="text-xs text-text-muted text-center py-4">
              Select a video clip first to apply smart face cropping.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
