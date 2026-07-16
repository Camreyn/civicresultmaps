"use client";

import { $createLinkNode, $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $createListItemNode,
  $createListNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $isHeadingNode, HeadingNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  FORMAT_TEXT_COMMAND,
  type ElementNode,
  type EditorState,
  type LexicalNode,
} from "lexical";
import { Bold, Code2, Heading2, Italic, Link2, List, ListOrdered } from "lucide-react";
import type {
  WorkspaceRichTextBlockV1,
  WorkspaceRichTextDocumentV1,
  WorkspaceRichTextInlineV1,
} from "@/lib/workspace-layout-v2";

export function LayoutRichTextEditor({
  document,
  onChange,
}: {
  document: WorkspaceRichTextDocumentV1;
  onChange: (document: WorkspaceRichTextDocumentV1) => void;
}) {
  const initialConfig = {
    editorState: () => initializeEditor(document),
    namespace: "CivicResultMapsLayoutEditor",
    nodes: [HeadingNode, LinkNode, ListItemNode, ListNode],
    onError(error: Error) {
      throw error;
    },
    theme: {
      link: "layout-rich-link",
      paragraph: "layout-rich-paragraph",
      text: { bold: "layout-rich-bold", code: "layout-rich-code", italic: "layout-rich-italic" },
    },
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="layout-rich-editor">
        <RichTextToolbar />
        <RichTextPlugin
          contentEditable={<ContentEditable aria-label="Rich text content" className="layout-rich-content" />}
          placeholder={<div className="layout-rich-placeholder">Write explanatory content…</div>}
          ErrorBoundary={RichTextErrorBoundary}
        />
        <HistoryPlugin />
        <LinkPlugin />
        <ListPlugin />
        <OnChangePlugin onChange={(state) => onChange(readEditorState(state))} />
      </div>
    </LexicalComposer>
  );
}

function RichTextToolbar() {
  const [editor] = useLexicalComposerContext();
  const format = (name: "bold" | "code" | "italic") => editor.dispatchCommand(FORMAT_TEXT_COMMAND, name);
  return (
    <div aria-label="Text formatting" className="layout-rich-toolbar" role="toolbar">
      <button aria-label="Bold" onClick={() => format("bold")} type="button"><Bold size={15} /></button>
      <button aria-label="Italic" onClick={() => format("italic")} type="button"><Italic size={15} /></button>
      <button aria-label="Inline code" onClick={() => format("code")} type="button"><Code2 size={15} /></button>
      <button aria-label="Heading" onClick={() => editor.update(() => {
        const first = $getRoot().getFirstChild();
        if (!first) return;
        if (!$isElementNode(first)) return;
        const heading = $createHeadingNode("h2");
        heading.append(...first.getChildren());
        first.replace(heading);
      })} type="button"><Heading2 size={15} /></button>
      <button aria-label="Bulleted list" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} type="button"><List size={15} /></button>
      <button aria-label="Numbered list" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} type="button"><ListOrdered size={15} /></button>
      <button aria-label="Link" onClick={() => {
        const href = window.prompt("Link URL (https://, mailto:, or a local /path)");
        if (href) editor.dispatchCommand(TOGGLE_LINK_COMMAND, href);
      }} type="button"><Link2 size={15} /></button>
    </div>
  );
}

function initializeEditor(document: WorkspaceRichTextDocumentV1) {
  const root = $getRoot();
  root.clear();
  let currentList: ReturnType<typeof $createListNode> | null = null;
  let currentListOrdered: boolean | undefined;

  for (const block of document.blocks) {
    if (block.type === "list-item") {
      if (!currentList || currentListOrdered !== block.ordered) {
        currentList = $createListNode(block.ordered ? "number" : "bullet");
        currentListOrdered = block.ordered;
        root.append(currentList);
      }
      const item = $createListItemNode();
      appendInlineNodes(item, block.children);
      currentList.append(item);
      continue;
    }

    currentList = null;
    currentListOrdered = undefined;
    const element = block.type === "heading"
      ? $createHeadingNode(block.level === 3 ? "h3" : "h2")
      : $createParagraphNode();
    appendInlineNodes(element, block.children);
    root.append(element);
  }
  if (!root.getChildrenSize()) root.append($createParagraphNode());
}

function appendInlineNodes(element: ElementNode, children: WorkspaceRichTextInlineV1[]) {
  for (const inline of children) {
    const text = $createTextNode(inline.text);
    inline.marks?.forEach((mark) => text.toggleFormat(mark));
    if (inline.href) {
      const link = $createLinkNode(inline.href);
      link.append(text);
      element.append(link);
    } else {
      element.append(text);
    }
  }
}

function readEditorState(state: EditorState): WorkspaceRichTextDocumentV1 {
  return state.read(() => {
    const blocks = $getRoot().getChildren().flatMap((node): WorkspaceRichTextBlockV1[] => {
      const inlines = collectInlineNodes(node);
      if (!inlines.length) inlines.push({ text: "", type: "text" });
      if ($isHeadingNode(node)) {
        return [{ children: inlines, level: node.getTag() === "h3" ? 3 : 2, type: "heading" }];
      }
      if ($isListNode(node)) {
        return node.getChildren().map((item) => ({
          children: collectInlineNodes(item),
          ordered: node.getListType() === "number",
          type: "list-item",
        }));
      }
      return [{ children: inlines, type: "paragraph" }];
    });
    return { blocks: blocks.slice(0, 60), version: 1 };
  });
}

function collectInlineNodes(node: LexicalNode): WorkspaceRichTextInlineV1[] {
  if ($isTextNode(node)) {
    const marks: WorkspaceRichTextInlineV1["marks"] = [];
    if (node.hasFormat("bold")) marks.push("bold");
    if (node.hasFormat("italic")) marks.push("italic");
    if (node.hasFormat("code")) marks.push("code");
    const parent = node.getParent();
    return [{
      href: parent && $isLinkNode(parent) ? parent.getURL() : undefined,
      marks: marks.length ? marks : undefined,
      text: node.getTextContent().slice(0, 1000),
      type: "text",
    }];
  }
  return $isElementNode(node) ? node.getChildren().flatMap(collectInlineNodes) : [];
}

function RichTextErrorBoundary({ children }: { children: React.ReactNode }) {
  return children;
}
