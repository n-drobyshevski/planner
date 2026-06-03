"use client";

import { toast } from "sonner";
import { useWorkspace } from "@/lib/hooks/use-workspace";

/**
 * Toast wrapper that honors the member's `showSuccessToasts` preference. The
 * `success` variant is suppressed when the pref is off (it defaults to true
 * while the member is still loading); error / warning / info always fire. The
 * flag is read from the already-mounted workspace query, so the gate is
 * reactive with no extra fetch, and `usePreferences().setShowSuccessToasts`
 * patches that cache so the next toast is gated immediately. React Compiler
 * memoizes the returned closures, so consumers can list them in effect deps.
 */
export function useNotify() {
  const show = useWorkspace().data?.currentMember?.showSuccessToasts ?? true;

  const success = (...args: Parameters<typeof toast.success>) =>
    show ? toast.success(...args) : undefined;

  return {
    success,
    error: toast.error,
    warning: toast.warning,
    info: toast.info,
    message: toast.message,
    loading: toast.loading,
  } as const;
}
