"use client";

import type { CsvSchema } from "@/types";

interface Props {
  sessionId: string;
  csvSchema: CsvSchema | null;
}

export function ChatPanel({ sessionId, csvSchema }: Props) {
  return (
    <div>
      <h1>ChatPanel</h1>
    </div>
  );
}
