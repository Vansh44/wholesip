"use client";

import { useChat } from "./chat-context";
import {
  X,
  Eye,
  Maximize2,
  ChevronDown,
  Plus,
  Mic,
  Sparkles,
} from "lucide-react";

export function DashboardChat() {
  const { isChatOpen, closeChat } = useChat();

  if (!isChatOpen) return null;

  return (
    <div className="dash-chat flex flex-col h-full bg-white border-l border-t border-[#e5e5e5] shadow-sm overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f1f1]">
        <button className="flex items-center gap-1.5 text-sm font-semibold text-[#1a1a1a] hover:bg-[#f1f1f1] px-2 py-1 rounded-md transition-colors">
          New conversation
          <ChevronDown className="h-4 w-4 text-[#5c5f62]" />
        </button>
        <div className="flex items-center gap-1 text-[#5c5f62]">
          <button
            className="p-1.5 hover:bg-[#f1f1f1] rounded-md transition-colors"
            aria-label="Visibility"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 hover:bg-[#f1f1f1] rounded-md transition-colors"
            aria-label="Expand"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={closeChat}
            className="p-1.5 hover:bg-[#f1f1f1] rounded-md transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center">
        <div className="h-10 w-10 bg-[#f4f0ff] rounded-xl flex items-center justify-center mb-4 text-[#7F4AFA]">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-[#1a1a1a] mb-1">Hey there</h2>
        <h3 className="text-xl font-bold text-[#1a1a1a] mb-6">
          How can I help?
        </h3>

        <button className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#e5e5e5] text-sm font-medium text-[#1a1a1a] hover:bg-[#f9f9f9] transition-colors shadow-sm">
          <div className="h-2 w-2 rounded-full bg-[#7F4AFA]" />
          What&apos;s new?
        </button>
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-[#f1f1f1]">
        <div className="flex items-center border border-[#e5e5e5] rounded-xl px-3 py-2 bg-white shadow-sm focus-within:border-[#7F4AFA] focus-within:ring-1 focus-within:ring-[#7F4AFA] transition-all">
          <input
            type="text"
            placeholder="Ask anything..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-[#1a1a1a] placeholder:text-[#8c9196]"
          />
          <div className="flex items-center gap-1 text-[#8c9196]">
            <button className="p-1.5 hover:bg-[#f1f1f1] hover:text-[#1a1a1a] rounded-md transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button className="p-1.5 hover:bg-[#f1f1f1] hover:text-[#1a1a1a] rounded-md transition-colors">
              <Mic className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
