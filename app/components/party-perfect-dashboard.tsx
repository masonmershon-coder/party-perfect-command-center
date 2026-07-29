"use client";

import { OwnerPinModal } from "@/app/components/auth/owner-pin-modal";
import { AgentChatView } from "@/app/components/dashboard/agent-chat-view";
import { PartyPerfectLogo } from "@/app/components/dashboard/party-perfect-logo";
import { AgentsSection } from "@/app/components/dashboard/agents-section";
import { BookkeepingSection } from "@/app/components/dashboard/bookkeeping-section";
import { DashboardHome } from "@/app/components/dashboard/dashboard-home";
import { EmailsSection } from "@/app/components/dashboard/emails-section";
import { MarketingSection } from "@/app/components/dashboard/marketing-section";
import { HiringSection } from "@/app/components/dashboard/hiring-section";
import { ReportsSection } from "@/app/components/dashboard/reports-section";
import { InventorySection } from "@/app/components/dashboard/inventory-section";
import { CommandCenterHeader } from "@/app/components/dashboard/page-header";
import { LiveNotifications } from "@/app/components/dashboard/live-notifications";
import { Sidebar } from "@/app/components/dashboard/sidebar";
import { SocialSection } from "@/app/components/dashboard/social-section";
import { TasksSection } from "@/app/components/dashboard/tasks-section";
import { VersionBadge } from "@/app/components/dashboard/version-badge";
import type { EmailAccount, EmailConnectionInfo } from "@/lib/email-accounts";
import {
  createBookkeepingEntry,
  createInventoryItem,
  createTask,
  connectAccount,
  deleteJob,
  disconnectAccount,
  fetchAgentChat,
  fetchAgents,
  fetchBookkeeping,
  fetchConnections,
  fetchEmails,
  fetchGrokAgent,
  fetchInventory,
  fetchMarketing,
  fetchJobs,
  fetchReports,
  fetchSocial,
  fetchStats,
  fetchTasks,
  generateWeeklyRecapReport,
  streamAgentChat,
  streamEmailDraftReply,
  streamSocialDraftReply,
  streamTaskRun,
  sendWeeklyRecapSms,
  sendTestSms,
  updateEmail,
  updateSocialItem,
  sendSocialReply,
  updateTaskStatus,
} from "@/lib/client-api";
import {
  readLiveModeEnabled,
  writeLiveModeEnabled,
} from "@/lib/client-live-store";
import {
  canAccessSection,
  clearStoredUserRole,
  readUserRole,
  writeUserRole,
  type UserRole,
} from "@/lib/user-roles";
import {
  isOwnerSection,
  isOwnerSessionValid,
  signOut as clearAuthSession,
} from "@/lib/auth";
import { useLiveDashboard } from "@/app/hooks/use-live-dashboard";
import {
  removeLocalConnectionToken,
  saveLocalConnectionToken,
} from "@/lib/client-connection-store";
import type { MetaConnectionInfo, SocialAccount } from "@/lib/social-accounts";
import { GROK_CHAT_AGENT_ID } from "@/lib/seed";
import type {
  Agent,
  BookkeepingEntry,
  CatchUpItem,
  DashboardStats,
  EmailAccountId,
  EmailItem,
  InventoryItem,
  MarketingItem,
  Message,
  NavSection,
  SavedReport,
  SanitizedConnection,
  SocialComment,
  SocialDirectMessage,
  SocialEngagementSummary,
  SocialPlatform,
  SocialPost,
  Task,
  TaskStatus,
} from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function PartyPerfectDashboard() {
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<NavSection>("dashboard");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [chatAgentId, setChatAgentId] = useState<string | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [grokAgent, setGrokAgent] = useState<Agent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [emailConnection, setEmailConnection] =
    useState<EmailConnectionInfo | null>(null);
  const [connections, setConnections] = useState<SanitizedConnection[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [socialConnection, setSocialConnection] =
    useState<MetaConnectionInfo | null>(null);
  const [socialOauthUrls, setSocialOauthUrls] = useState<
    Record<SocialPlatform, string | null>
  >({ facebook: null, instagram: null });
  const [socialEngagement, setSocialEngagement] = useState<
    SocialEngagementSummary[]
  >([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [socialComments, setSocialComments] = useState<SocialComment[]>([]);
  const [socialMessages, setSocialMessages] = useState<SocialDirectMessage[]>(
    [],
  );
  const [socialSyncError, setSocialSyncError] = useState<string | null>(null);
  const [bookkeeping, setBookkeeping] = useState<BookkeepingEntry[]>([]);
  const [marketing, setMarketing] = useState<MarketingItem[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [jobApplications, setJobApplications] = useState<
    import("@/lib/jobs").JobApplication[]
  >([]);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsFlagged, setJobsFlagged] = useState(0);
  const [jobsStoreMode, setJobsStoreMode] = useState<
    "redis" | "blob" | "ephemeral" | "local" | null
  >(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [loading, setLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catchUpFocus, setCatchUpFocus] = useState<{
    type: CatchUpItem["type"];
    id: string;
    autoDraft: boolean;
  } | null>(null);
  const [liveModeEnabled, setLiveModeEnabled] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>("employee");
  const [ownerUnlocked, setOwnerUnlocked] = useState(false);
  const [ownerPinOpen, setOwnerPinOpen] = useState(false);
  const [pendingOwnerSection, setPendingOwnerSection] =
    useState<NavSection | null>(null);

  const activeChatAgentId =
    activeSection === "chat"
      ? chatAgentId ?? grokAgent?.id ?? GROK_CHAT_AGENT_ID
      : selectedAgentId;

  const activeChatAgent =
    agents.find((agent) => agent.id === activeChatAgentId) ??
    (grokAgent?.id === activeChatAgentId ? grokAgent : null);

  const refreshConnections = useCallback(async () => {
    const payload = await fetchConnections();
    setConnections(payload.connections);
  }, []);

  const refreshEmails = useCallback(async () => {
    const payload = await fetchEmails();
    setEmailAccounts(payload.accounts);
    setEmailConnection(payload.connection);
    setEmails(payload.emails);
  }, []);

  const refreshSocial = useCallback(async () => {
    const payload = await fetchSocial();
    setSocialAccounts(payload.accounts);
    setSocialConnection(payload.connection);
    setSocialOauthUrls(payload.oauthUrls);
    setSocialEngagement(payload.engagement);
    setSocialPosts(payload.posts);
    setSocialComments(payload.comments);
    setSocialMessages(payload.messages);
    setSocialSyncError(
      payload.sync && !payload.sync.ok && payload.sync.error
        ? payload.sync.error
        : null,
    );
  }, []);

  const refreshMarketing = useCallback(async () => {
    setMarketing(await fetchMarketing());
  }, []);

  const refreshReports = useCallback(async () => {
    setReports(await fetchReports());
  }, []);

  const refreshJobs = useCallback(async () => {
    const payload = await fetchJobs();
    setJobApplications(payload.applications);
    setJobsTotal(payload.total);
    setJobsFlagged(payload.flaggedForJosh);
    setJobsStoreMode(payload.storeMode ?? null);
  }, []);

  const refreshTasksOnly = useCallback(async () => {
    const nextTasks = await fetchTasks();
    setTasks(nextTasks);
  }, []);

  const {
    mikeChecking,
    isRefreshing,
    lastCheckedAt,
    notifications,
    dismissNotification,
    newEmailIds,
    newCommentIds,
    setStatsRef,
  } = useLiveDashboard({
    enabled: liveModeEnabled,
    activeSection,
    onStatsUpdate: (nextStats) => {
      setStats((current) =>
        current ? { ...current, ...nextStats } : nextStats,
      );
    },
    refreshEmails,
    refreshSocial,
    refreshTasks: refreshTasksOnly,
  });

  useEffect(() => {
    setLiveModeEnabled(readLiveModeEnabled());

    async function hydrateAccess() {
      const unlocked = await isOwnerSessionValid();
      setOwnerUnlocked(unlocked);
      const storedRole = readUserRole();
      if (unlocked && storedRole === "owner") {
        setUserRole("owner");
      } else {
        setUserRole("employee");
        if (!unlocked) {
          writeUserRole("employee");
        }
      }
    }

    void hydrateAccess();
  }, []);

  function openOwnerPin(nextSection: NavSection | null = null) {
    setPendingOwnerSection(nextSection);
    setOwnerPinOpen(true);
  }

  function handleOwnerUnlockSuccess() {
    setOwnerUnlocked(true);
    setUserRole("owner");
    writeUserRole("owner");
    if (pendingOwnerSection) {
      setActiveSection(pendingOwnerSection);
      setPendingOwnerSection(null);
    }
  }

  function handleSignOut() {
    clearAuthSession();
    clearStoredUserRole();
    window.location.reload();
  }

  useEffect(() => {
    setStatsRef(stats);
  }, [stats, setStatsRef]);

  function handleLiveModeChange(enabled: boolean) {
    setLiveModeEnabled(enabled);
    writeLiveModeEnabled(enabled);
  }

  function handleUserRoleChange(role: UserRole) {
    if (role === "owner" && !ownerUnlocked) {
      openOwnerPin(null);
      return;
    }
    setUserRole(role);
    writeUserRole(role);
    if (!canAccessSection(role, activeSection)) {
      setActiveSection("dashboard");
    }
  }

  const handleNavigate = useCallback(
    (section: NavSection) => {
      if (isOwnerSection(section) && !ownerUnlocked) {
        setPendingOwnerSection(section);
        setOwnerPinOpen(true);
        return;
      }
      if (!canAccessSection(userRole, section)) return;
      setActiveSection(section);
      if (section !== "agents") {
        setSelectedAgentId(null);
      }
    },
    [ownerUnlocked, userRole],
  );

  function openMadisonChat() {
    const madison = agents.find((agent) => agent.slug === "madison-comms");
    if (madison) {
      openAgentChat(madison.id);
    }
  }

  const handleConnectAccount = useCallback(
    async (input: {
      type: "email" | "social";
      accountKey: string;
      label: string;
    }) => {
      const connection = await connectAccount(input);
      saveLocalConnectionToken(connection.sessionToken);
      await refreshConnections();
    },
    [refreshConnections],
  );

  const handleDisconnectAccount = useCallback(
    async (input: {
      type: "email" | "social";
      accountKey: string;
    }) => {
      const existing = connections.find(
        (entry) =>
          entry.type === input.type && entry.accountKey === input.accountKey,
      );
      if (existing) {
        await disconnectAccount({ sessionToken: existing.sessionToken });
        removeLocalConnectionToken(existing.sessionToken);
      } else {
        await disconnectAccount(input);
      }
      await refreshConnections();
    },
    [connections, refreshConnections],
  );

  const refreshAll = useCallback(async () => {
    const settled = await Promise.allSettled([
      fetchAgents(),
      fetchGrokAgent(),
      fetchTasks(),
      fetchInventory(),
      fetchBookkeeping(),
      fetchStats(),
      fetchMarketing(),
      fetchReports(),
      refreshEmails(),
      refreshSocial(),
      refreshConnections(),
      refreshJobs(),
    ]);

    const [
      nextAgents,
      nextGrokAgent,
      nextTasks,
      nextInventory,
      nextBookkeeping,
      nextStats,
      nextMarketing,
      nextReports,
    ] = settled;

    if (nextAgents.status === "fulfilled") setAgents(nextAgents.value);
    if (nextGrokAgent.status === "fulfilled") setGrokAgent(nextGrokAgent.value);
    if (nextTasks.status === "fulfilled") setTasks(nextTasks.value);
    if (nextInventory.status === "fulfilled") setInventory(nextInventory.value);
    if (nextBookkeeping.status === "fulfilled") {
      setBookkeeping(nextBookkeeping.value);
    }
    if (nextStats.status === "fulfilled") setStats(nextStats.value);
    if (nextMarketing.status === "fulfilled") setMarketing(nextMarketing.value);
    if (nextReports.status === "fulfilled") setReports(nextReports.value);

    const failed = settled.filter((result) => result.status === "rejected");
    if (failed.length === settled.length) {
      const first = failed[0] as PromiseRejectedResult;
      throw first.reason instanceof Error
        ? first.reason
        : new Error("Failed to load dashboard.");
    }
    if (failed.length > 0) {
      const first = failed[0] as PromiseRejectedResult;
      setError(
        first.reason instanceof Error
          ? `Some panels failed to load: ${first.reason.message}`
          : "Some panels failed to load.",
      );
    }
  }, [refreshConnections, refreshEmails, refreshJobs, refreshSocial]);

  const refreshChat = useCallback(async (agentId: string) => {
    const payload = await fetchAgentChat(agentId);
    setMessages(payload.conversation.messages);
    setAgents((current) =>
      current.map((agent) =>
        agent.id === agentId ? payload.agent : agent,
      ),
    );
    if (grokAgent?.id === agentId) {
      setGrokAgent(payload.agent);
    }
  }, [grokAgent?.id]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (
      section === "social" ||
      section === "emails" ||
      section === "dashboard" ||
      section === "agents" ||
      section === "tasks" ||
      section === "inventory" ||
      section === "bookkeeping" ||
      section === "marketing" ||
      section === "hiring" ||
      section === "reports"
    ) {
      handleNavigate(section as NavSection);
    }

    const connected = searchParams.get("connected");
    if (connected === "facebook" || connected === "instagram") {
      void handleConnectAccount({
        type: "social",
        accountKey: connected,
        label: connected === "facebook" ? "Facebook" : "Instagram",
      }).then(() => refreshSocial());
    }

    const oauthError = searchParams.get("oauth_error");
    if (oauthError) {
      setSocialSyncError(oauthError);
      void refreshSocial();
    }
  }, [searchParams, handleConnectAccount, refreshSocial, handleNavigate]);

  useEffect(() => {
    if (!ownerUnlocked && isOwnerSection(activeSection)) {
      setActiveSection("dashboard");
      setUserRole("employee");
      writeUserRole("employee");
    }
  }, [ownerUnlocked, activeSection]);

  useEffect(() => {
    async function bootstrap() {
      try {
        await refreshAll();
      } catch (bootstrapError) {
        setError(
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Failed to load dashboard.",
        );
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [refreshAll]);

  useEffect(() => {
    if (!activeChatAgentId) return;
    if (activeSection === "agents" && !selectedAgentId) return;
    if (activeSection !== "agents" && activeSection !== "chat") return;

    void refreshChat(activeChatAgentId).catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load conversation.",
      );
    });
  }, [activeChatAgentId, activeSection, selectedAgentId, refreshChat]);

  function openAgentChat(agentId: string) {
    setSelectedAgentId(agentId);
    setActiveSection("agents");
  }

  function handleCatchUpOpen(item: CatchUpItem, draftReply: boolean) {
    setCatchUpFocus({
      type: item.type,
      id: item.id,
      autoDraft: draftReply,
    });
    setActiveSection(item.type === "email" ? "emails" : "social");
  }

  async function handleSendMessage(message: string) {
    const agentId = activeChatAgentId;
    if (!agentId) return;

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setIsStreaming(true);

    try {
      await streamAgentChat(agentId, message, (content) => {
        setMessages((current) =>
          current.map((entry) =>
            entry.id === assistantMessage.id
              ? { ...entry, content }
              : entry,
          ),
        );
      });

      await Promise.all([refreshChat(agentId), refreshAll()]);
    } catch (chatError) {
      setMessages((current) =>
        current.filter((entry) => entry.id !== assistantMessage.id),
      );
      throw chatError;
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleCreateTask(input: {
    agentId: string;
    title: string;
    description: string;
  }) {
    await createTask(input);
    await refreshAll();
  }

  async function handleUpdateTaskStatus(taskId: string, status: TaskStatus) {
    await updateTaskStatus(taskId, status);
    await refreshAll();
  }

  async function handleRunTask(taskId: string) {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) return;

    setRunningTaskId(taskId);
    setIsStreaming(true);
    setSelectedAgentId(task.agentId);
    setActiveSection("agents");

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      taskId,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, assistantMessage]);

    try {
      await streamTaskRun(
        taskId,
        (content) => {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === assistantMessage.id
                ? { ...entry, content }
                : entry,
            ),
          );
        },
        (progress) => {
          setTasks((current) =>
            current.map((entry) =>
              entry.id === taskId ? { ...entry, progress } : entry,
            ),
          );
        },
      );

      await Promise.all([refreshChat(task.agentId), refreshAll()]);
    } finally {
      setRunningTaskId(null);
      setIsStreaming(false);
    }
  }

  function renderMainContent() {
    if (activeSection === "agents" && selectedAgentId) {
      return (
        <AgentChatView
          agent={activeChatAgent}
          messages={messages}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onBack={() => setSelectedAgentId(null)}
          showBack
          sectionTitle="Agent Chat"
          onSendWeeklyRecap={
            activeChatAgent?.slug === "mike-operations"
              ? async () => {
                  const result = await sendWeeklyRecapSms();
                  await refreshReports();
                  return result;
                }
              : undefined
          }
          onSendTestSms={
            activeChatAgent?.slug === "mike-operations"
              ? sendTestSms
              : undefined
          }
          agentHints={
            activeChatAgent?.slug === "madison-comms"
              ? [
                  "Draft a warm reply to the latest Instagram wedding comment",
                  "What's trending for Tulsa event engagement this week?",
                  "Help Michelle reply to a big client gala inquiry",
                  "Quick friendly response for a Facebook pricing question",
                ]
              : activeChatAgent?.slug === "mike-operations"
                ? [
                    "Summarize today's Catch Up queue",
                    "What tasks need attention this week?",
                    "Draft a manager update on inbox backlog",
                  ]
                : undefined
          }
        />
      );
    }

    if (activeSection === "chat") {
      return (
        <AgentChatView
          agent={activeChatAgent}
          messages={messages}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          sectionTitle="Chat with Grok"
        />
      );
    }

    switch (activeSection) {
      case "dashboard":
        return stats ? (
          <DashboardHome
            stats={stats}
            agents={agents}
            tasks={tasks}
            reports={reports}
            liveModeEnabled={liveModeEnabled}
            lastCheckedAt={lastCheckedAt}
            onNavigateAgents={() => setActiveSection("agents")}
            onNavigateTasks={() => setActiveSection("tasks")}
            onNavigateEmails={() => setActiveSection("emails")}
            onNavigateSocial={() => setActiveSection("social")}
            onNavigateReports={() => setActiveSection("reports")}
            onCatchUpOpen={handleCatchUpOpen}
            onSelectAgent={openAgentChat}
          />
        ) : null;
      case "agents":
        return (
          <AgentsSection
            agents={agents}
            onSelectAgent={openAgentChat}
            madisonLive={Boolean(socialConnection?.madisonLive)}
            lastSocialSyncAt={socialConnection?.lastSyncedAt ?? null}
          />
        );
      case "tasks":
        return (
          <TasksSection
            tasks={tasks}
            agents={agents}
            runningTaskId={runningTaskId}
            onCreateTask={handleCreateTask}
            onUpdateStatus={handleUpdateTaskStatus}
            onRunTask={handleRunTask}
            liveModeEnabled={liveModeEnabled}
            lastCheckedAt={lastCheckedAt}
            isRefreshing={isRefreshing}
          />
        );
      case "inventory":
        return (
          <InventorySection
            inventory={inventory}
            onCreateItem={async (input) => {
              await createInventoryItem(input);
              await refreshAll();
            }}
          />
        );
      case "emails":
        return emailConnection ? (
          <EmailsSection
            accounts={
              userRole === "owner"
                ? emailAccounts
                : emailAccounts.filter((account) => account.id === "company")
            }
            connection={emailConnection}
            emails={
              userRole === "owner"
                ? emails
                : emails.filter((email) => email.accountId === "company")
            }
            connections={connections}
            liveModeEnabled={liveModeEnabled}
            lastCheckedAt={lastCheckedAt}
            isRefreshing={isRefreshing}
            newItemIds={newEmailIds}
            onConnectAccount={async (accountKey, label) => {
              if (userRole !== "owner" && accountKey !== "company") return;
              await handleConnectAccount({
                type: "email",
                accountKey,
                label,
              });
            }}
            onDisconnectAccount={async (accountKey) => {
              if (userRole !== "owner" && accountKey !== "company") return;
              await handleDisconnectAccount({ type: "email", accountKey });
            }}
            onUpdateEmail={async (id, patch) => {
              await updateEmail(id, patch);
              const [_, nextStats] = await Promise.all([
                refreshEmails(),
                fetchStats(),
              ]);
              setStats(nextStats);
            }}
            onDraftReply={streamEmailDraftReply}
            focusEmailId={
              catchUpFocus?.type === "email" ? catchUpFocus.id : null
            }
            autoDraftReply={
              catchUpFocus?.type === "email" ? catchUpFocus.autoDraft : false
            }
            onFocusConsumed={() => setCatchUpFocus(null)}
          />
        ) : null;
      case "social":
        return socialConnection ? (
          <SocialSection
            accounts={socialAccounts}
            connection={socialConnection}
            oauthUrls={socialOauthUrls}
            engagement={socialEngagement}
            posts={socialPosts}
            comments={socialComments}
            messages={socialMessages}
            connections={connections}
            liveModeEnabled={liveModeEnabled}
            lastCheckedAt={lastCheckedAt}
            isRefreshing={isRefreshing}
            newItemIds={newCommentIds}
            onConnect={async (platform, oauthUrl) => {
              if (oauthUrl) {
                window.location.href = oauthUrl;
                return;
              }
              await handleConnectAccount({
                type: "social",
                accountKey: platform,
                label: platform === "facebook" ? "Facebook" : "Instagram",
              });
              await refreshSocial();
            }}
            onDisconnect={async (platform) => {
              await handleDisconnectAccount({ type: "social", accountKey: platform });
              await refreshSocial();
            }}
            onUpdateItem={async (kind, id, status) => {
              await updateSocialItem(kind, id, status);
              const [_, nextStats] = await Promise.all([
                refreshSocial(),
                fetchStats(),
              ]);
              setStats(nextStats);
            }}
            onDraftReply={streamSocialDraftReply}
            onSendReply={async (kind, id, message) => {
              const result = await sendSocialReply(kind, id, message);
              const [_, nextStats] = await Promise.all([
                refreshSocial(),
                fetchStats(),
              ]);
              setStats(nextStats);
              return {
                sentViaMeta: Boolean(result.sentViaMeta),
                message: result.message,
              };
            }}
            syncError={socialSyncError}
            onMetaSetupSaved={refreshSocial}
            focusCommentId={
              catchUpFocus?.type === "social_comment" ? catchUpFocus.id : null
            }
            autoDraftReply={
              catchUpFocus?.type === "social_comment"
                ? catchUpFocus.autoDraft
                : false
            }
            onFocusConsumed={() => setCatchUpFocus(null)}
            onCatchUpOpen={handleCatchUpOpen}
            onAskMadison={openMadisonChat}
          />
        ) : null;
      case "marketing":
        return (
          <MarketingSection marketing={marketing} />
        );
      case "hiring":
        return (
          <HiringSection
            applications={jobApplications}
            total={jobsTotal}
            flaggedForJosh={jobsFlagged}
            storeMode={jobsStoreMode ?? undefined}
            onRefresh={refreshJobs}
            onDelete={async (id) => {
              await deleteJob(id);
              await refreshJobs();
            }}
          />
        );
      case "reports":
        return (
          <ReportsSection
            reports={reports}
            isOwner={userRole === "owner"}
            onGenerateRecap={async () => {
              const report = await generateWeeklyRecapReport();
              await refreshReports();
              return report;
            }}
            onSendSmsRecap={
              userRole === "owner"
                ? async () => {
                    await sendWeeklyRecapSms();
                    await refreshReports();
                  }
                : undefined
            }
          />
        );
      case "bookkeeping":
        return (
          <BookkeepingSection
            entries={bookkeeping}
            onCreateEntry={async (input) => {
              await createBookkeepingEntry(input);
              await refreshAll();
            }}
          />
        );
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--pp-bg)]">
        <div className="text-center">
          <PartyPerfectLogo variant="sidebar" className="mx-auto opacity-90" />
          <p className="mt-6 text-sm text-[var(--pp-text-muted)]">
            Loading Command Center…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--pp-bg)] text-[var(--pp-text)]">
      <OwnerPinModal
        open={ownerPinOpen}
        onClose={() => {
          setOwnerPinOpen(false);
          setPendingOwnerSection(null);
        }}
        onSuccess={handleOwnerUnlockSuccess}
      />
      <Sidebar
        activeSection={activeSection}
        userRole={userRole}
        ownerUnlocked={ownerUnlocked}
        onRequestOwner={() => openOwnerPin(null)}
        replyCounts={
          stats
            ? {
                emails: {
                  unread: stats.emailsUnread,
                  needsReply: stats.emailsNeedsReply,
                },
                social: {
                  unread: stats.socialUnread,
                  needsReply: stats.socialNeedsReply,
                },
              }
            : undefined
        }
        onNavigate={handleNavigate}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <CommandCenterHeader
          liveModeEnabled={liveModeEnabled}
          onLiveModeChange={handleLiveModeChange}
          mikeChecking={mikeChecking}
          lastLiveCheckAt={lastCheckedAt}
          userRole={userRole}
          ownerLocked={!ownerUnlocked}
          onUserRoleChange={handleUserRoleChange}
          onRequestOwner={() => openOwnerPin(null)}
          onSignOut={handleSignOut}
        />
        <LiveNotifications
          notifications={notifications}
          onDismiss={dismissNotification}
        />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:px-8 lg:py-8">
          {renderMainContent()}
        </main>
      </div>

      {error && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500 shadow-lg">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-3 underline">
            Dismiss
          </button>
        </div>
      )}

      <VersionBadge />
    </div>
  );
}
