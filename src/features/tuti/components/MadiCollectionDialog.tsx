"use client";
import { useState } from "react";
import { AppDialogFrame } from "@/shared/ui/AppDialogFrame";
import { MadiHarumadiSelection } from "../screens/journal/MadiHarumadiSelection";

export function MadiCollectionDialog({ ownerId, entryId, onClose }: { ownerId: string; entryId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return <AppDialogFrame role="dialog" presentation="fullscreen" titleId="madi-collection-heading" busy={busy} onCancel={onClose}>
    <MadiHarumadiSelection ownerId={ownerId} entryId={entryId} existingEntry onBusyChange={setBusy} onDone={onClose} onNext={onClose} />
  </AppDialogFrame>;
}
