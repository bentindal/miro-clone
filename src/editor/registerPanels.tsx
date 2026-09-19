import { COMMENTS_PANEL } from './Editor';
import { CommentsBody, ShowResolvedToggle } from './CommentsPanel';
import { registerPanel } from './panels';

/**
 * The panels the editor ships with. Comments is the first; anything else
 * docks the same way, without the layout knowing about it.
 */
registerPanel({
  id: COMMENTS_PANEL,
  slot: 'right',
  icon: 'comment',
  title: 'Comments',
  badge: (editor) => editor.comments.openCount,
  headerExtra: (editor) => <ShowResolvedToggle editor={editor} />,
  render: (editor) => <CommentsBody editor={editor} />,
});
