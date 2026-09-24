"use client";

import { useState } from "react";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CircleAlert, RefreshCw, Watch } from "lucide-react";

import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatRelativeToNow } from "@/lib/datetime/format";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import { useHealthConnection, useInvalidateHealthConnection } from "@/lib/hooks/use-health";

/**
 * The Fitbit Air / Google Health connection: Connect (redirects to Google),
 * status + last sync time + last error once connected, Sync now, and
 * Disconnect (revokes at Google, deletes the connection and every synced
 * row). No form fields — this section is one live status readout plus three
 * actions, matching the plain/direct voice PRODUCT.md asks for.
 */
export function HealthSettings() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const workspace = useWorkspace();
  const viewerId = workspace.data?.currentMember?.id;
  const { connection, isLoading } = useHealthConnection(viewerId);
  const invalidate = useInvalidateHealthConnection();

  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/health/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        synced?: boolean;
        error?: string;
        reason?: string;
      };
      if (!res.ok || body.error) {
        toast.error(body.error ?? t("health.syncError"));
      } else if (body.synced === false && body.reason === "sync_in_progress") {
        toast.info(t("health.syncInProgress"));
      } else {
        toast.success(t("health.syncSuccess"));
      }
      if (viewerId) await invalidate(viewerId);
    } catch {
      toast.error(t("health.syncError"));
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/health/disconnect", { method: "POST" });
      if (!res.ok) throw new Error();
      if (viewerId) await invalidate(viewerId);
      toast.success(t("health.disconnectSuccess"));
    } catch {
      toast.error(t("health.disconnectError"));
    } finally {
      setDisconnecting(false);
      setConfirmOpen(false);
    }
  };

  const isConnected = connection !== null && connection.status !== "revoked";
  const isError = connection?.status === "error";

  return (
    <SettingsSection title={t("health.title")} description={t("health.description")}>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel>
            <Watch aria-hidden className="size-4 text-muted-foreground" />
            {t("health.statusLabel")}
          </FieldLabel>
          <FieldDescription>
            {isLoading
              ? t("health.loading")
              : !isConnected
                ? t("health.notConnected")
                : isError
                  ? t("health.statusError", { error: connection?.lastError ?? "" })
                  : connection?.lastSyncedAt != null
                    ? t("health.statusConnected", {
                        time: formatRelativeToNow(connection.lastSyncedAt, locale),
                      })
                    : t("health.statusConnectedNeverSynced")}
          </FieldDescription>
        </FieldContent>

        {!isConnected ? (
          <Button asChild size="sm">
            <NextLink href="/api/health/connect" prefetch={false}>
              {t("health.connect")}
            </NextLink>
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void syncNow()} disabled={syncing}>
              <RefreshCw data-icon="inline-start" className={syncing ? "animate-spin" : undefined} />
              {t("health.syncNow")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              {t("health.disconnect")}
            </Button>
          </div>
        )}
      </Field>

      {isError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground shadow-soft"
        >
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {connection?.lastError ?? t("health.genericError")}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("health.privacyNote")}</p>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("health.disconnectConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("health.disconnectConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("health.disconnectConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={disconnecting}
              onClick={() => void disconnect()}
            >
              {t("health.disconnectConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
