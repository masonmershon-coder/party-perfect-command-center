import { getSocialData, listEmails, listTasks } from "./storage";
import type { LiveSnapshot } from "./types";

function needsReplyEmail(status: string) {
  return status !== "replied" && status !== "archived";
}

function needsReplySocial(status: string) {
  return status !== "replied" && status !== "archived";
}

export async function buildLiveSnapshot(): Promise<LiveSnapshot> {
  const [emails, social, tasks] = await Promise.all([
    listEmails(),
    getSocialData(),
    listTasks(),
  ]);

  const unreadEmails = emails.filter((email) => email.status === "unread");
  const needsReplyEmails = emails.filter((email) =>
    needsReplyEmail(email.status),
  );

  const unreadComments = social.comments.filter(
    (comment) => comment.status === "unread",
  );
  const fbUnreadComments = unreadComments.filter(
    (comment) => comment.platform === "facebook",
  );
  const igUnreadComments = unreadComments.filter(
    (comment) => comment.platform === "instagram",
  );
  const needsReplyComments = social.comments.filter((comment) =>
    needsReplySocial(comment.status),
  );

  const unreadMessages = social.messages.filter(
    (message) => message.status === "unread",
  );

  return {
    checkedAt: new Date().toISOString(),
    agent: "mike-operations",
    emails: {
      unreadIds: unreadEmails.map((email) => email.id),
      unreadCount: unreadEmails.length,
      needsReplyCount: needsReplyEmails.length,
    },
    social: {
      unreadCommentIds: unreadComments.map((comment) => comment.id),
      fbUnreadCommentIds: fbUnreadComments.map((comment) => comment.id),
      igUnreadCommentIds: igUnreadComments.map((comment) => comment.id),
      unreadCommentCount: unreadComments.length,
      unreadMessageCount: unreadMessages.length,
      needsReplyCount: needsReplyComments.length,
    },
    tasks: {
      todoCount: tasks.filter((task) => task.status === "todo").length,
      inProgressCount: tasks.filter((task) => task.status === "in_progress")
        .length,
    },
  };
}
