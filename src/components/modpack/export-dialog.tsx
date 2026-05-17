import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { exportModpack } from "@/lib/tauri/commands";
import type { Id } from "@/types/instance";

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  instanceId: Id;
  instanceName: string;
}

export function ExportDialog({ open, onClose, instanceId, instanceName }: ExportDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [outputPath, setOutputPath] = useState("");
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    if (!outputPath.trim()) return;
    setBusy(true);
    try {
      await exportModpack(instanceId, outputPath.trim());
      toast({
        title: t("common.export"),
        description: instanceName,
        variant: "success",
      });
      onClose();
    } catch (err) {
      toast({
        title: t("common.export"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("common.export")} description={instanceName}>
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="export-output-path" className="font-medium">
          Output path
        </label>
        <Input
          id="export-output-path"
          value={outputPath}
          onChange={(e) => setOutputPath(e.target.value)}
          placeholder="C:\\modpacks\\my-pack.knoxpack"
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button onClick={onExport} disabled={busy || !outputPath.trim()}>
          {t("common.export")}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
