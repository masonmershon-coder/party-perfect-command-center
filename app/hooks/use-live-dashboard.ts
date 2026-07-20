"use client";

import { fetchLiveCheck } from "@/lib/client-api";
import {
  LIVE_POLL_INTERVAL_MS,
  LIVE_REFRESH_SECTIONS,
} from "@/lib/client-live-store";
import type {
  DashboardStats,
  LiveNotification,
  LiveSnapshot,
  NavSection,
} from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

function buildNotifications(
  newEmailCount: number,
  newFbCount: number,
  newIgCount: number,
): LiveNotification[] {
  const createdAt = new Date().toISOString();
  const notifications: LiveNotification[] = [];

  if (newEmailCount > 0) {
    notifications.push({
      id: crypto.randomUUID(),
      kind: "emails",
      count: newEmailCount,
      message: `${newEmailCount} new email${newEmailCount === 1 ? "" : "s"}`,
      createdAt,
    });
  }

  if (newFbCount > 0) {
    notifications.push({
      id: crypto.randomUUID(),
      kind: "facebook",
      count: newFbCount,
      message: `${newFbCount} new FB comment${newFbCount === 1 ? "" : "s"}`,
      createdAt,
    });
  }

  if (newIgCount > 0) {
    notifications.push({
      id: crypto.randomUUID(),
      kind: "instagram",
      count: newIgCount,
      message: `${newIgCount} new IG comment${newIgCount === 1 ? "" : "s"}`,
      createdAt,
    });
  }

  return notifications;
}

function snapshotToStats(snapshot: LiveSnapshot): DashboardStats {
  return {
    agentCount: 0,
    tasksTodo: snapshot.tasks.todoCount,
    tasksInProgress: snapshot.tasks.inProgressCount,
    tasksDone: 0,
    inventoryLow: 0,
    marketingScheduled: 0,
    emailsUnread: snapshot.emails.unreadCount,
    emailsNeedsReply: snapshot.emails.needsReplyCount,
    emailsBusinessPriority: 0,
    socialUnread:
      snapshot.social.unreadCommentCount + snapshot.social.unreadMessageCount,
    socialNeedsReply: snapshot.social.needsReplyCount,
    bookkeepingPending: 0,
  };
}

function mergeStats(
  current: DashboardStats | null,
  snapshot: LiveSnapshot,
): DashboardStats {
  const partial = snapshotToStats(snapshot);
  if (!current) return partial;

  return {
    ...current,
    tasksTodo: partial.tasksTodo,
    tasksInProgress: partial.tasksInProgress,
    emailsUnread: partial.emailsUnread,
    emailsNeedsReply: partial.emailsNeedsReply,
    socialUnread: partial.socialUnread,
    socialNeedsReply: partial.socialNeedsReply,
  };
}

export function useLiveDashboard({
  enabled,
  activeSection,
  onStatsUpdate,
  refreshEmails,
  refreshSocial,
  refreshTasks,
}: {
  enabled: boolean;
  activeSection: NavSection;
  onStatsUpdate: (stats: DashboardStats) => void;
  refreshEmails: () => Promise<void>;
  refreshSocial: () => Promise<void>;
  refreshTasks: () => Promise<void>;
}) {
  const [mikeChecking, setMikeChecking] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [newEmailIds, setNewEmailIds] = useState<string[]>([]);
  const [newCommentIds, setNewCommentIds] = useState<string[]>([]);

  const pollInFlightRef = useRef(false);
  const seededRef = useRef(false);
  const knownEmailIdsRef = useRef<Set<string>>(new Set());
  const knownCommentIdsRef = useRef<Set<string>>(new Set());
  const refreshEmailsRef = useRef(refreshEmails);
  const refreshSocialRef = useRef(refreshSocial);
  const refreshTasksRef = useRef(refreshTasks);
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const activeSectionRef = useRef(activeSection);
  const statsRef = useRef<DashboardStats | null>(null);

  refreshEmailsRef.current = refreshEmails;
  refreshSocialRef.current = refreshSocial;
  refreshTasksRef.current = refreshTasks;
  onStatsUpdateRef.current = onStatsUpdate;
  activeSectionRef.current = activeSection;

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const runLiveCheck = useCallback(async () => {
    if (!enabled || pollInFlightRef.current || document.hidden) return;

    pollInFlightRef.current = true;
    setMikeChecking(true);

    try {
      const { snapshot } = await fetchLiveCheck();
      const section = activeSectionRef.current;

      if (!seededRef.current) {
        knownEmailIdsRef.current = new Set(snapshot.emails.unreadIds);
        knownCommentIdsRef.current = new Set(snapshot.social.unreadCommentIds);
        seededRef.current = true;
      } else {
        const newEmailIdsList = snapshot.emails.unreadIds.filter(
          (id) => !knownEmailIdsRef.current.has(id),
        );
        const newFbIds = snapshot.social.fbUnreadCommentIds.filter(
          (id) => !knownCommentIdsRef.current.has(id),
        );
        const newIgIds = snapshot.social.igUnreadCommentIds.filter(
          (id) => !knownCommentIdsRef.current.has(id),
        );

        knownEmailIdsRef.current = new Set(snapshot.emails.unreadIds);
        knownCommentIdsRef.current = new Set(snapshot.social.unreadCommentIds);

        const incoming = buildNotifications(
          newEmailIdsList.length,
          newFbIds.length,
          newIgIds.length,
        );

        if (incoming.length > 0) {
          setNotifications((current) => [...incoming, ...current].slice(0, 5));
        }

        if (newEmailIdsList.length > 0) {
          setNewEmailIds(newEmailIdsList);
          window.setTimeout(() => setNewEmailIds([]), 30_000);
        }

        const allNewComments = [...newFbIds, ...newIgIds];
        if (allNewComments.length > 0) {
          setNewCommentIds(allNewComments);
          window.setTimeout(() => setNewCommentIds([]), 30_000);
        }
      }

      onStatsUpdateRef.current(
        mergeStats(statsRef.current, snapshot),
      );
      setLastCheckedAt(snapshot.checkedAt);

      const shouldRefreshSection = (
        LIVE_REFRESH_SECTIONS as readonly string[]
      ).includes(section);

      if (shouldRefreshSection) {
        setIsRefreshing(true);
        const refreshes: Promise<void>[] = [];

        if (section === "emails") {
          refreshes.push(refreshEmailsRef.current());
        }
        if (section === "social") {
          refreshes.push(refreshSocialRef.current());
        }
        if (section === "tasks" || section === "dashboard") {
          refreshes.push(refreshTasksRef.current());
        }

        await Promise.all(refreshes);
        setIsRefreshing(false);
      }
    } catch {
      // background poll — fail silently
    } finally {
      pollInFlightRef.current = false;
      setMikeChecking(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      seededRef.current = false;
      knownEmailIdsRef.current = new Set();
      knownCommentIdsRef.current = new Set();
      setMikeChecking(false);
      setIsRefreshing(false);
      return;
    }

    void runLiveCheck();

    const interval = window.setInterval(() => {
      void runLiveCheck();
    }, LIVE_POLL_INTERVAL_MS);

    function handleVisibility() {
      if (!document.hidden && enabled) {
        void runLiveCheck();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, runLiveCheck]);

  const setStatsRef = useCallback((stats: DashboardStats | null) => {
    statsRef.current = stats;
  }, []);

  return {
    mikeChecking,
    isRefreshing,
    lastCheckedAt,
    notifications,
    dismissNotification,
    newEmailIds,
    newCommentIds,
    setStatsRef,
  };
}
