import { useEffect, useRef, useState } from 'react';
import type { CommentThread } from '../sync/comments';
import { loadUser } from '../sync/session';
import type { Editor } from './Editor';
import { useEditorVersion } from './useEditor';
import { Button } from '../ui';

/** Header control: whether resolved threads are listed. */
export function ShowResolvedToggle({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  return (
    <label className="show-resolved">
      <input type="checkbox" data-testid="show-resolved" checked={editor.showResolved} onChange={(e) => editor.setShowResolved(e.target.checked)} /> Show resolved
    </label>
  );
}

/**
 * Body of the comments panel: compose a pending comment, browse threads,
 * reply, resolve. The author is read from the stored identity at post time,
 * which renaming in the top bar keeps current, online or not. The dock
 * supplies the surrounding panel; see `registerPanels.tsx`.
 */
export function CommentsBody({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const author = () => loadUser();
  const threads = editor.comments.list().filter((t) => editor.showResolved || !t.resolved);
  const readOnly = editor.readOnly;

  return (
    <div className="comments-body" data-testid="comments-panel">
      {editor.pendingComment && (
        <Composer
          testId="comment-composer"
          placeholder={editor.pendingComment.shapeId ? 'Comment on this object…' : 'Comment here…'}
          disabled={readOnly}
          onSubmit={(text) => editor.postComment(author(), text)}
          onCancel={() => editor.cancelComment()}
        />
      )}
      {threads.length === 0 && !editor.pendingComment && (
        <p className="comments-empty" data-testid="comments-empty">
          {readOnly ? 'No comments yet.' : 'No comments yet. Pick the Comment tool (M) and click an object or anywhere on the board.'}
        </p>
      )}
      <ul className="thread-list">
        {threads.map((t) => (
          <ThreadView key={t.id} thread={t} editor={editor} author={author} readOnly={readOnly} active={t.id === editor.activeThreadId} />
        ))}
      </ul>
    </div>
  );
}

function ThreadView({ thread, editor, author, readOnly, active }: { thread: CommentThread; editor: Editor; author: () => { name: string; color: string }; readOnly: boolean; active: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const anchored = thread.shapeId && editor.scene.has(thread.shapeId);
  return (
    <li ref={ref} className={`thread${active ? ' active' : ''}${thread.resolved ? ' resolved' : ''}`} data-testid="thread" data-thread-id={thread.id} onClick={() => editor.openThread(thread.id)}>
      <div className="thread-head">
        <span className="thread-anchor">{anchored ? 'On an object' : thread.shapeId ? 'Object removed' : 'On the board'}</span>
        {!readOnly && (
          <Button
            size="sm"
            variant="ghost"
            icon={thread.resolved ? undefined : 'check'}
            data-testid={thread.resolved ? 'reopen-thread' : 'resolve-thread'}
            onClick={(e) => {
              e.stopPropagation();
              editor.resolveThread(thread.id, !thread.resolved);
            }}
          >
            {thread.resolved ? 'Reopen' : 'Resolve'}
          </Button>
        )}
      </div>
      <ul className="messages">
        {thread.messages.map((m) => (
          <li key={m.id} data-testid="comment-message">
            <span className="avatar" style={{ background: m.color }} aria-hidden="true">
              {m.author.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="message-meta">
                <strong data-testid="comment-author">{m.author}</strong> <time dateTime={new Date(m.at).toISOString()}>{formatTime(m.at)}</time>
              </div>
              <div className="message-text" data-testid="comment-text">
                {m.text}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {active && !thread.resolved && (
        <Composer testId="reply-composer" placeholder={readOnly ? 'View-only links cannot reply' : 'Reply…'} disabled={readOnly} onSubmit={(text) => editor.replyToThread(thread.id, author(), text)} />
      )}
    </li>
  );
}

function Composer({ testId, placeholder, disabled, onSubmit, onCancel }: { testId: string; placeholder: string; disabled: boolean; onSubmit: (text: string) => void; onCancel?: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text);
    setText('');
  };
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        data-testid={testId}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape' && onCancel) onCancel();
        }}
      />
      <div className="composer-actions">
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" variant="primary" disabled={disabled || !text.trim()} data-testid={`${testId}-post`}>
          Post
        </Button>
      </div>
    </form>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString();
}
