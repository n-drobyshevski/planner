"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getSiteOrigin } from "@/lib/site-url";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SettingsSection } from "@/components/settings/settings-section";
import { ShareFormDialog } from "@/components/settings/sharing/share-form-dialog";
import { formatDayMonthYear } from "@/lib/datetime/format";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import {
  useCreateShare,
  useDeleteShare,
  usePublicShares,
  useRevokeShare,
  useUnrevokeShare,
  useUpdateShare,
} from "@/lib/hooks/use-public-shares";
import type { PublicShareRow } from "@/lib/types";

type Status = "active" | "expired" | "revoked";

function statusOf(share: PublicShareRow): Status {
  if (share.revokedAt != null) return "revoked";
  if (share.expiresAt != null && share.expiresAt < Date.now()) return "expired";
  return "active";
}

const STATUS_ICON: Record<Status, LucideIcon> = {
  active: CheckCircle2,
  expired: Clock,
  revoked: XCircle,
};

/**
 * Public share links the owner manages. Each row makes "privacy is legible"
 * literal: at a glance you can read what a link exposes (its mode + category
 * scope), whether it's live (status as icon + text, never color alone), and its
 * full URL. Creating, editing, copying, revoking, and deleting all live here.
 */
export function SharingSettings() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const workspace = useWorkspace();
  const workspaceId = workspace.data?.workspaceId;
  const memberId = workspace.data?.currentMember?.id;
  const categories = workspace.data?.categories ?? [];

  const { shares, isLoading } = usePublicShares(workspaceId);
  const createShare = useCreateShare(workspaceId, memberId);
  const updateShare = useUpdateShare(workspaceId);
  const revokeShare = useRevokeShare(workspaceId);
  const unrevokeShare = useUnrevokeShare(workspaceId);
  const deleteShare = useDeleteShare(workspaceId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PublicShareRow | undefined>(undefined);
  const [revoking, setRevoking] = useState<PublicShareRow | null>(null);
  const [deleting, setDeleting] = useState<PublicShareRow | null>(null);

  const shareUrl = (token: string) => {
    const origin = getSiteOrigin();
    return origin ? `${origin}/share/${token}` : `/share/${token}`;
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast.success(t("sharing.toasts.copied"));
    } catch {
      toast.error(t("sharing.toasts.copyFailed"));
    }
  };

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (share: PublicShareRow) => {
    setEditing(share);
    setFormOpen(true);
  };

  /** Plain-language summary of what a link discloses, axis by axis. */
  const visibilitySummary = (share: PublicShareRow): string => {
    if (
      share.showEventTitles &&
      share.showEventDetails &&
      share.showContextNames
    )
      return t("sharing.visibility.full");
    const parts: string[] = [];
    if (share.showEventTitles) {
      parts.push(t("sharing.visibility.titles"));
      if (share.showEventDetails) parts.push(t("sharing.visibility.notes"));
    } else {
      parts.push(t("sharing.visibility.busy"));
    }
    if (share.showContextNames) parts.push(t("sharing.visibility.contextNames"));
    return parts.join(", ");
  };

  /** Plain-language summary of which categories a link can show. */
  const scopeSummary = (share: PublicShareRow): string => {
    if (share.categoryIds == null) return t("sharing.scope.all");
    const names = share.categoryIds
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length === 0)
      return t("sharing.scope.count", { count: share.categoryIds.length });
    if (names.length <= 2) return names.join(", ");
    return t("sharing.scope.namesPlusMore", {
      names: names.slice(0, 2).join(", "),
      count: names.length - 2,
    });
  };

  return (
    <SettingsSection
      title={t("sharing.title")}
      description={t("sharing.description")}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">
            {t("sharing.links.heading")}
          </h3>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("sharing.links.create")}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("sharing.loading")}</p>
        ) : shares.length === 0 ? (
          <Empty className="rounded-2xl border border-dashed border-border bg-transparent p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2 aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t("sharing.empty.title")}</EmptyTitle>
              <EmptyDescription>{t("sharing.empty.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-3">
            {shares.map((share) => {
              const status = statusOf(share);
              const StatusIcon = STATUS_ICON[status];
              const revoked = status === "revoked";
              const VisIcon = share.showEventTitles ? Eye : EyeOff;
              return (
                <li
                  key={share.id}
                  className={cn(
                    "rounded-2xl border border-border bg-card p-4",
                    revoked && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {share.label?.trim() || t("sharing.untitled")}
                        </span>
                        {/* Status: icon + text, never color alone (WCAG AAA). */}
                        <Badge
                          variant="outline"
                          className={cn(
                            "gap-1",
                            status === "active" &&
                              "border-primary/30 text-primary",
                            status === "expired" && "text-muted-foreground",
                            status === "revoked" && "text-muted-foreground",
                          )}
                        >
                          <StatusIcon aria-hidden />
                          {t(`sharing.status.${status}`)}
                        </Badge>
                      </div>

                      {/* What this link exposes — visibility + category scope. */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <VisIcon className="size-3.5" aria-hidden />
                          {visibilitySummary(share)}
                        </span>
                        <span aria-hidden className="text-border">
                          ·
                        </span>
                        <span>{scopeSummary(share)}</span>
                        {share.expiresAt != null && (
                          <>
                            <span aria-hidden className="text-border">
                              ·
                            </span>
                            <span className="tabular-nums">
                              {t(
                                status === "expired"
                                  ? "sharing.expiredOn"
                                  : "sharing.expiresOn",
                                {
                                  date: formatDayMonthYear(
                                    share.expiresAt,
                                    undefined,
                                    locale,
                                  ),
                                },
                              )}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Full public URL + copy. */}
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 truncate rounded-lg bg-muted/60 px-2 py-1 font-mono text-xs text-muted-foreground">
                          {shareUrl(share.token)}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyLink(share.token)}
                          aria-label={t("sharing.actions.copy")}
                        >
                          <Copy />
                        </Button>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("sharing.actions.more")}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyLink(share.token)}>
                          <Copy />
                          {t("sharing.actions.copy")}
                        </DropdownMenuItem>
                        {!revoked && (
                          <DropdownMenuItem onClick={() => openEdit(share)}>
                            <Pencil />
                            {t("sharing.actions.edit")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {revoked ? (
                          <DropdownMenuItem
                            onClick={() => unrevokeShare(share.id)}
                          >
                            <RotateCcw />
                            {t("sharing.actions.restore")}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setRevoking(share)}>
                            <XCircle />
                            {t("sharing.actions.revoke")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(share)}
                        >
                          <Trash2 />
                          {t("sharing.actions.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ShareFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        share={editing}
        onCreate={createShare}
        onUpdate={updateShare}
      />

      {/* Revoke confirm — revoking is permanent for that token. */}
      <AlertDialog
        open={revoking != null}
        onOpenChange={(o) => !o && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sharing.revokeConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sharing.revokeConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sharing.revokeConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (revoking) void revokeShare(revoking.id);
                setRevoking(null);
              }}
            >
              {t("sharing.revokeConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm. */}
      <AlertDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sharing.deleteConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sharing.deleteConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("sharing.deleteConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting) void deleteShare(deleting.id);
                setDeleting(null);
              }}
            >
              {t("sharing.deleteConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
