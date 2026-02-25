import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "../features/editor";

export const Route = createFileRoute("/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-full h-screen bg-zinc-950">
      <Editor initialContent="# New Note\n\nStart typing here..." />
    </div>
  );
}
