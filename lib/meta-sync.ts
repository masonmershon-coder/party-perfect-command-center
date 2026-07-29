import {
  fetchFacebookComments,
  fetchFacebookPosts,
  fetchInstagramComments,
  fetchInstagramMedia,
  formatMetaUserError,
  resolveMetaConfig,
  MetaGraphError,
} from "./meta-graph";
import { mergeMetaSocialData } from "./storage";
import type { SocialComment, SocialPlatform, SocialPost } from "./types";

const MAX_POSTS_PER_PLATFORM = 8;
const MAX_COMMENTS_PER_POST = 40;

export interface MetaSyncReport {
  syncedAt: string;
  mode: "live" | "demo";
  ok: boolean;
  postsFetched: number;
  commentsFetched: number;
  addedComments: number;
  facebookOk: boolean;
  instagramOk: boolean;
  error?: string;
  isTokenInvalid?: boolean;
  unreadHighPriority: SocialComment[];
}

function toPostId(platform: SocialPlatform, externalId: string) {
  return `meta-${platform}-post-${externalId}`;
}

function toCommentId(platform: SocialPlatform, externalId: string) {
  return `meta-${platform}-comment-${externalId}`;
}

export async function syncMetaSocial(): Promise<MetaSyncReport> {
  const config = await resolveMetaConfig();
  const syncedAt = new Date().toISOString();

  if (!config) {
    return {
      syncedAt,
      mode: "demo",
      ok: false,
      postsFetched: 0,
      commentsFetched: 0,
      addedComments: 0,
      facebookOk: false,
      instagramOk: false,
      unreadHighPriority: [],
      error:
        "Meta not connected yet. Use Social → Connect setup (App ID + Secret, then Connect with Facebook).",
    };
  }

  const posts: SocialPost[] = [];
  const comments: SocialComment[] = [];
  let facebookOk = false;
  let instagramOk = false;

  try {
    const fbPosts = await fetchFacebookPosts(config, MAX_POSTS_PER_PLATFORM);
    facebookOk = true;

    for (const post of fbPosts) {
      const postId = toPostId("facebook", post.id);
      posts.push({
        id: postId,
        platform: "facebook",
        caption: post.message?.trim() || "(no caption)",
        publishedAt: post.created_time,
        likes: post.likes?.summary?.total_count ?? 0,
        comments: post.comments?.summary?.total_count ?? 0,
        reach: 0,
        status: "published",
        externalId: post.id,
        source: "meta",
        permalink: post.permalink_url,
      });

      try {
        const fbComments = await fetchFacebookComments(
          config,
          post.id,
          MAX_COMMENTS_PER_POST,
        );
        for (const comment of fbComments) {
          const text = comment.message?.trim() || "";
          if (!text) continue;
          comments.push({
            id: toCommentId("facebook", comment.id),
            postId,
            platform: "facebook",
            author: comment.from?.name?.trim() || "Facebook user",
            authorHandle: comment.from?.name
              ? `@${comment.from.name.replace(/\s+/g, "").toLowerCase()}`
              : "@facebook",
            text,
            createdAt: comment.created_time,
            status: "unread",
            externalId: comment.id,
            source: "meta",
          });
        }
      } catch (error) {
        // Keep posts even if one comment fetch fails; bubble token errors
        if (error instanceof MetaGraphError && error.isTokenInvalid) {
          throw error;
        }
      }
    }

    if (config.instagramBusinessAccountId) {
      try {
        const igMedia = await fetchInstagramMedia(
          config,
          MAX_POSTS_PER_PLATFORM,
        );
        instagramOk = true;

        for (const media of igMedia) {
          const postId = toPostId("instagram", media.id);
          posts.push({
            id: postId,
            platform: "instagram",
            caption: media.caption?.trim() || "(no caption)",
            publishedAt: media.timestamp,
            likes: media.like_count ?? 0,
            comments: media.comments_count ?? 0,
            reach: 0,
            status: "published",
            externalId: media.id,
            source: "meta",
            permalink: media.permalink,
          });

          try {
            const igComments = await fetchInstagramComments(
              config,
              media.id,
              MAX_COMMENTS_PER_POST,
            );
            for (const comment of igComments) {
              const text = comment.text?.trim() || "";
              if (!text) continue;
              const username =
                comment.username ||
                comment.from?.username ||
                "instagram_user";
              comments.push({
                id: toCommentId("instagram", comment.id),
                postId,
                platform: "instagram",
                author: username,
                authorHandle: `@${username.replace(/^@/, "")}`,
                text,
                createdAt: comment.timestamp,
                status: "unread",
                externalId: comment.id,
                source: "meta",
              });
            }
          } catch (error) {
            if (error instanceof MetaGraphError && error.isTokenInvalid) {
              throw error;
            }
          }
        }
      } catch (error) {
        if (error instanceof MetaGraphError && error.isTokenInvalid) {
          throw error;
        }
        instagramOk = false;
      }
    }

    const { addedComments, unreadHighPriority } = await mergeMetaSocialData({
      posts,
      comments,
    });

    return {
      syncedAt,
      mode: "live",
      ok: facebookOk || instagramOk,
      postsFetched: posts.length,
      commentsFetched: comments.length,
      addedComments,
      facebookOk,
      instagramOk,
      unreadHighPriority,
    };
  } catch (error) {
    return {
      syncedAt,
      mode: "live",
      ok: false,
      postsFetched: posts.length,
      commentsFetched: comments.length,
      addedComments: 0,
      facebookOk,
      instagramOk,
      unreadHighPriority: [],
      error: formatMetaUserError(error),
      isTokenInvalid:
        error instanceof MetaGraphError ? error.isTokenInvalid : false,
    };
  }
}
