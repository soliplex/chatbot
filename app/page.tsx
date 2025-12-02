// app/page.tsx
import Chat from "@/components/Chat";

export default function Home() {
  // Configure these for your environment
  const AGUI_BASE_URL = process.env.NEXT_PUBLIC_AGUI_BASE_URL || "http://localhost:8000";
  const ROOM_ID = process.env.NEXT_PUBLIC_ROOM_ID || "default-room";

  return (
    <main className="min-h-screen bg-white">
      <Chat baseUrl={AGUI_BASE_URL} roomId={ROOM_ID} />
    </main>
  );
}

// .env.local example:
// NEXT_PUBLIC_AGUI_BASE_URL=http://localhost:8000
// NEXT_PUBLIC_ROOM_ID=my-room-123