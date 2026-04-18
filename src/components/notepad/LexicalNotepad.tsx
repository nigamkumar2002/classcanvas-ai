import React, { useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HeadingNode, QuoteNode, $createHeadingNode } from '@lexical/rich-text';
import { ListNode, ListItemNode, INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND, $getRoot } from 'lexical';
import { $setBlocksType } from '@lexical/selection';
import { Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Heading3, Undo, Redo, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

const theme = {
  paragraph: 'mb-2',
  heading: { h1: 'text-3xl font-bold mb-3 mt-4', h2: 'text-2xl font-bold mb-2 mt-3', h3: 'text-xl font-bold mb-2 mt-2' },
  list: { ul: 'list-disc ml-6 mb-2', ol: 'list-decimal ml-6 mb-2', listitem: 'mb-1' },
  text: { bold: 'font-bold', italic: 'italic', underline: 'underline' },
  quote: 'border-l-4 border-primary pl-4 italic my-3 text-muted-foreground',
  link: 'text-primary underline cursor-pointer',
};

function ToolbarButton({ onClick, active, children, title }: any) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={cn("p-2 rounded-md hover:bg-muted transition", active && "bg-primary/10 text-primary")}>
      {children}
    </button>
  );
}

function Toolbar({ disabled }: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext();
  if (disabled) return null;
  const formatHeading = (tag: 'h1' | 'h2' | 'h3') => {
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) $setBlocksType(sel, () => $createHeadingNode(tag));
    });
  };
  return (
    <div className="flex items-center flex-wrap gap-1 p-2 border-b border-border bg-muted/30 sticky top-0 z-10">
      <ToolbarButton title="Undo" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}><Undo className="w-4 h-4" /></ToolbarButton>
      <ToolbarButton title="Redo" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}><Redo className="w-4 h-4" /></ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />
      <ToolbarButton title="Bold" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}><Bold className="w-4 h-4" /></ToolbarButton>
      <ToolbarButton title="Italic" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}><Italic className="w-4 h-4" /></ToolbarButton>
      <ToolbarButton title="Underline" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}><Underline className="w-4 h-4" /></ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />
      <ToolbarButton title="Heading 1" onClick={() => formatHeading('h1')}><Heading1 className="w-4 h-4" /></ToolbarButton>
      <ToolbarButton title="Heading 2" onClick={() => formatHeading('h2')}><Heading2 className="w-4 h-4" /></ToolbarButton>
      <ToolbarButton title="Heading 3" onClick={() => formatHeading('h3')}><Heading3 className="w-4 h-4" /></ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />
      <ToolbarButton title="Bullet List" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}><List className="w-4 h-4" /></ToolbarButton>
      <ToolbarButton title="Numbered List" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}><ListOrdered className="w-4 h-4" /></ToolbarButton>
    </div>
  );
}

function LoadStatePlugin({ initialState }: { initialState?: any }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (initialState) {
      try {
        const state = typeof initialState === 'string' ? JSON.parse(initialState) : initialState;
        const parsed = editor.parseEditorState(state);
        editor.setEditorState(parsed);
      } catch (e) { console.warn('LexicalNotepad: failed to load state', e); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function ReadOnlyPlugin({ readOnly }: { readOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => { editor.setEditable(!readOnly); }, [editor, readOnly]);
  return null;
}

interface Props {
  initialContent?: any;
  onChange?: (json: any, plainText: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  preventCopy?: boolean;
}

const LexicalNotepad: React.FC<Props> = ({ initialContent, onChange, readOnly, placeholder = "Start writing your lesson plan...", className, preventCopy }) => {
  const config = {
    namespace: 'NotepadEditor',
    theme,
    onError: (e: Error) => console.error(e),
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
    editable: !readOnly,
  };

  return (
    <div
      className={cn("border border-border rounded-xl bg-background overflow-hidden", className)}
      onCopy={preventCopy ? (e) => e.preventDefault() : undefined}
      onContextMenu={preventCopy ? (e) => e.preventDefault() : undefined}
      style={preventCopy ? { userSelect: 'none' } : undefined}
    >
      <LexicalComposer initialConfig={config}>
        <Toolbar disabled={readOnly} />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  "outline-none prose prose-sm max-w-none focus:outline-none p-4",
                  readOnly ? "min-h-0 cursor-default" : "min-h-[300px] max-h-[60vh] overflow-y-auto"
                )}
              />
            }
            placeholder={<div className="absolute top-4 left-4 text-muted-foreground pointer-events-none">{placeholder}</div>}
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <LoadStatePlugin initialState={initialContent} />
        <ReadOnlyPlugin readOnly={!!readOnly} />
        {onChange && (
          <OnChangePlugin onChange={(state) => {
            state.read(() => {
              const text = $getRoot().getTextContent();
              onChange(state.toJSON(), text);
            });
          }} />
        )}
      </LexicalComposer>
    </div>
  );
};

export default LexicalNotepad;
