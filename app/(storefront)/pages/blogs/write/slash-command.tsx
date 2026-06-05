"use client";

/**
 * Notion-style "/" slash command menu for the blog editor.
 *
 * Typing "/" at the start of an empty-ish line opens a filterable list of
 * block options (headings, lists, quote, image, divider). It's built on
 * Tiptap's suggestion utility (handles the trigger + live query + key events)
 * and positioned with Floating UI (already a dependency of the bubble menu).
 */

import { forwardRef, useImperativeHandle, useState } from "react";
import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import {
  Heading1,
  Heading2,
  Heading3,
  Type,
  List,
  ListOrdered,
  Quote,
  Image as ImageIcon,
  Minus,
  type LucideIcon,
} from "lucide-react";

interface SlashItem {
  title: string;
  description: string;
  icon: LucideIcon;
  command: (args: { editor: Editor; range: Range }) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    icon: Type,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    title: "Bullet List",
    description: "Simple bulleted list",
    icon: List,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered List",
    description: "Ordered list with numbers",
    icon: ListOrdered,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Quote",
    description: "Capture a quotation",
    icon: Quote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: Minus,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "Image",
    description: "Embed an image by URL",
    icon: ImageIcon,
    command: ({ editor, range }) => {
      const url = window.prompt("Enter the URL of the image:");
      editor.chain().focus().deleteRange(range).run();
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
  },
];

interface SlashListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashMenuList = forwardRef<SlashListRef, SlashListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset the highlight to the top whenever the filtered list changes.
    // Adjusting state during render (instead of in an effect) is the React-
    // recommended pattern for syncing state to a changing prop.
    const [prevItems, setPrevItems] = useState(items);
    if (items !== prevItems) {
      setPrevItems(items);
      setSelectedIndex(0);
    }

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="slash-menu">
          <div className="slash-menu-empty">No matches</div>
        </div>
      );
    }

    return (
      <div className="slash-menu">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.title}
              className={`slash-menu-item ${index === selectedIndex ? "active" : ""}`}
              onMouseEnter={() => setSelectedIndex(index)}
              // Keep editor focus/selection so the stored range stays valid.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => command(item)}
            >
              <span className="slash-menu-icon">
                <Icon size={17} />
              </span>
              <span className="slash-menu-text">
                <span className="slash-menu-title">{item.title}</span>
                <span className="slash-menu-desc">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  },
);
SlashMenuList.displayName = "SlashMenuList";

function updatePosition(element: HTMLElement, getRect: () => DOMRect) {
  const virtualEl = { getBoundingClientRect: getRect };
  computePosition(virtualEl, element, {
    placement: "bottom-start",
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  }).then(({ x, y, strategy }) => {
    Object.assign(element.style, {
      position: strategy,
      left: `${x}px`,
      top: `${y}px`,
    });
  });
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: SlashItem;
        }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) =>
          SLASH_ITEMS.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()),
          ),
        render: () => {
          let renderer: ReactRenderer<SlashListRef, SlashListProps>;

          return {
            onStart: (props: {
              clientRect?: (() => DOMRect | null) | null;
              editor: Editor;
            }) => {
              renderer = new ReactRenderer(SlashMenuList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;
              renderer.element.style.position = "absolute";
              renderer.element.style.zIndex = "70";
              document.body.appendChild(renderer.element);
              updatePosition(
                renderer.element as HTMLElement,
                props.clientRect as () => DOMRect,
              );
            },

            onUpdate: (props: {
              clientRect?: (() => DOMRect | null) | null;
            }) => {
              renderer.updateProps(props);
              if (!props.clientRect) return;
              updatePosition(
                renderer.element as HTMLElement,
                props.clientRect as () => DOMRect,
              );
            },

            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === "Escape") {
                (renderer.element as HTMLElement).style.display = "none";
                return true;
              }
              return renderer.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              renderer.element.remove();
              renderer.destroy();
            },
          };
        },
      }),
    ];
  },
});
