import { COMMENTS_PANEL } from './Editor';
import { CommentsBody, ShowResolvedToggle } from './CommentsPanel';
import { registerPanel } from './panels';
import { PresentButton, SlidesBody } from './SlidesPanel';
import { ShortcutsBody } from './ShortcutsPanel';

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

registerPanel({
  id: 'slides',
  slot: 'right',
  icon: 'present',
  title: 'Slides',
  // No badge: the dock reads a badge out as "N open", which is right for
  // unresolved comments and wrong for a count of slides.
  headerExtra: (editor) => <PresentButton editor={editor} />,
  render: (editor) => <SlidesBody editor={editor} />,
});

registerPanel({
  id: 'shortcuts',
  slot: 'right',
  icon: 'keyboard',
  title: 'Shortcuts',
  render: (editor) => <ShortcutsBody editor={editor} />,
});
