import { useMemo } from 'react';
import { Board } from './editor/Board';
import { Editor } from './editor/Editor';
import { Toolbar } from './editor/Toolbar';
import { installTestHooks } from './testHooks';
import './app.css';

export default function App() {
  const editor = useMemo(() => {
    const e = new Editor();
    installTestHooks(e);
    return e;
  }, []);
  return (
    <div className="app">
      <Toolbar editor={editor} />
      <Board editor={editor} />
    </div>
  );
}
