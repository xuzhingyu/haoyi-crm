import { RecordEditor, QuickRecord } from './components/Studio';
import { WorkspaceScope } from './hooks/workspaceStorage';
import type { StudioRow } from './services/studio';
import { useWorkspace } from '../workspace';
import './scoped.css';
import './unified.css';

export default function TaskEditor({ row, quick, onClose, onSaved }: { row?:Record<string,unknown>; quick?:boolean; onClose:()=>void; onSaved:()=>void }) {
  const {user}=useWorkspace();
  return <WorkspaceScope.Provider value={`${user.org_id}:${user.user_id}:operator`}><div className="legacy-crm">{quick?<QuickRecord onSaved={onSaved}/>:<RecordEditor kind="action" row={row as StudioRow|undefined} onClose={onClose} onSaved={onSaved}/>}</div></WorkspaceScope.Provider>;
}
