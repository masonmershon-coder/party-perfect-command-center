"use client";

import Link from "next/link";
import type { MessageSubmitResponse } from "@/lib/matter/kituwa-contract-types";

export function MatterAcknowledgment({ ack }: { ack: MessageSubmitResponse | null }) {
  if (!ack) return null;
  return (
    <section className="kituwa-ack" aria-label="Matter acknowledgment">
      <div className="kituwa-ack-row">
        <span className="kituwa-ack-label">message_id</span>
        <code>{ack.message_id}</code>
      </div>
      <div className="kituwa-ack-row">
        <span className="kituwa-ack-label">task_id</span>
        <Link href={`/tasks/${ack.task_id}`} className="kituwa-ack-link">
          {ack.task_id}
        </Link>
      </div>
      <div className="kituwa-ack-row">
        <span className="kituwa-ack-label">status</span>
        <strong>{ack.status.toUpperCase()}</strong>
        {ack.duplicate ? <span className="kituwa-ack-dup">duplicate client_message_id</span> : null}
      </div>
      <div className="kituwa-ack-row">
        <span className="kituwa-ack-label">acknowledged_at</span>
        <time dateTime={ack.acknowledged_at}>{ack.acknowledged_at}</time>
      </div>
    </section>
  );
}
