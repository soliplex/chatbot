// app/page.tsx
"use client";

import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), {
  ssr: false,
});

export default function Home() {
  const baseUrl = process.env.NEXT_PUBLIC_AGUI_BASE_URL || "http://localhost:8000";

  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <ChatWidget
        config={{
          baseUrl,
          title: "Chat with us",
        }}
      />
    </main>
  );
}
