"use client";

import type { KituwaTask } from "@/lib/kituwa/types";

export function MatterLive({ tasks }: { tasks: KituwaTask[] }) {
  if (!tasks.length) {
    return (
      <div className="kituwa-office">
        <div className="kituwa-station">OPS ROOM IDLE<br />NO ACTIVE WORKERS</div>
      </div>
    );
  }
  return (
    <div className="kituwa-office">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="kituwa-station"
          data-busy={task.state === "RUNNING" ? "1" : "0"}
          data-blocked={task.state === "BLOCKED" || task.state === "WAITING_APPROVAL" ? "1" : "0"}
        >
          {task.assignmentHat || task.category.toUpperCase()}
          <br />
          {task.assignmentWorkerId ? `HAT ${task.assignmentWorkerId}` : "HAT NONE"}
          <br />
          {task.state}
        </div>
      ))}
    </div>
  );
}
