"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Code,
  Pencil,
  Brain,
  Lightbulb,
  Globe,
  Palette,
  Music,
  Heart,
  BookOpen,
  Coffee,
  Briefcase,
  Gamepad2,
  Plane,
  Microscope,
  ChefHat,
  Calculator,
  MessageCircle,
  Shield,
  Camera,
} from "lucide-react";
import type { UploadedFile } from "@/lib/providers";

interface EmptyStateProps {
  onPromptClick: (content: string, files: UploadedFile[]) => void;
}

interface PromptSuggestion {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}

const PROMPT_BANK: PromptSuggestion[] = [
  // --- Creative Writing ---
  { icon: Pencil, text: "Write a short story about a robot discovering emotions" },
  { icon: Pencil, text: "Compose a haiku about the northern lights" },
  { icon: BookOpen, text: "Write the opening chapter of a cyberpunk detective novel" },
  { icon: Pencil, text: "Create a dialogue between a time traveler and a medieval knight" },
  { icon: BookOpen, text: "Rewrite a fairy tale from the villain's perspective" },
  { icon: Heart, text: "Write a heartfelt letter to your future self in 10 years" },

  // --- Programming & Tech ---
  { icon: Code, text: "Explain how async/await works in JavaScript" },
  { icon: Code, text: "Write a Python function to find prime numbers efficiently" },
  { icon: Code, text: "Compare React Server Components vs Client Components" },
  { icon: Code, text: "Show me how to build a REST API with Next.js route handlers" },
  { icon: Code, text: "Explain the difference between SQL and NoSQL databases" },
  { icon: Calculator, text: "Solve this algorithm: find the longest palindrome substring" },

  // --- Science & Learning ---
  { icon: Microscope, text: "Summarize the key ideas of quantum computing" },
  { icon: Brain, text: "Explain how neural networks learn from data" },
  { icon: Globe, text: "What caused the Cambrian explosion 540 million years ago?" },
  { icon: Microscope, text: "How does CRISPR gene editing actually work?" },
  { icon: Brain, text: "Explain the theory of relativity in simple terms" },
  { icon: Globe, text: "What are the most promising renewable energy technologies?" },

  // --- Brainstorming & Ideas ---
  { icon: Lightbulb, text: "Help me brainstorm ideas for a new mobile app" },
  { icon: Lightbulb, text: "Suggest 10 unique SaaS business ideas for 2026" },
  { icon: Briefcase, text: "Create a 30-day content calendar for a tech blog" },
  { icon: Lightbulb, text: "Help me come up with a name for my startup" },
  { icon: Gamepad2, text: "Design a unique game mechanic for a puzzle RPG" },
  { icon: Briefcase, text: "Write a compelling pitch deck outline for investors" },

  // --- Practical Help ---
  { icon: ChefHat, text: "Give me a healthy meal prep plan for the week" },
  { icon: Plane, text: "Plan a 5-day itinerary for Tokyo on a budget" },
  { icon: Coffee, text: "Write a professional email to decline a meeting politely" },
  { icon: Calculator, text: "Help me build a personal budget spreadsheet template" },
  { icon: Shield, text: "What are the best cybersecurity practices for a small business?" },
  { icon: Camera, text: "Tips for taking better portrait photos with a smartphone" },

  // --- Art & Design ---
  { icon: Palette, text: "Describe a color palette for a calming meditation app" },
  { icon: Palette, text: "Explain the principles of minimalist graphic design" },
  { icon: Music, text: "Analyze the song structure of a pop hit" },
  { icon: Camera, text: "How to compose a visually balanced photograph" },

  // --- Fun & Conversation ---
  { icon: MessageCircle, text: "If animals could talk, which would be the funniest and why?" },
  { icon: Sparkles, text: "Tell me a fascinating fact I probably don't know" },
  { icon: Gamepad2, text: "Create a text-based adventure game set in a haunted mansion" },
  { icon: Music, text: "Recommend 5 underrated albums from the last decade" },
  { icon: Heart, text: "What are the scientific benefits of gratitude journaling?" },
];

function shuffleAndPick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function EmptyState({ onPromptClick }: EmptyStateProps) {
  const [prompts, setPrompts] = useState<PromptSuggestion[]>([]);

  useEffect(() => {
    setPrompts(shuffleAndPick(PROMPT_BANK, 4));
  }, []);

  // Don't render until client picks prompts (hydration safety)
  if (prompts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-[var(--color-text)]">
            What can I help with?
          </h1>
          <p className="mb-10 text-[var(--color-text-secondary)]">
            Ask me anything — I&apos;m here to help.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="text-center"
      >
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-[var(--color-text)]">
          What can I help with?
        </h1>
        <p className="mb-10 text-[var(--color-text-secondary)]">
          Ask me anything — I&apos;m here to help.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {prompts.map((prompt, idx) => {
          const Icon = prompt.icon;
          return (
            <button
              key={prompt.text}
              onClick={() => onPromptClick(prompt.text, [])}
              className="group flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-sm transition-all hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-sidebar)] hover:shadow-md"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-sidebar)] text-[var(--color-accent)] group-hover:bg-[var(--color-accent)]/10">
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] group-hover:text-[var(--color-text)]">
                {prompt.text}
              </p>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
