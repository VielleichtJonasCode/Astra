import { useUiStore } from '../store/uiStore'
import { cx } from '../lib/cx'
import { TitleBar } from './TitleBar'
import { TabBar } from './TabBar'
import { Toolbar } from './Toolbar/Toolbar'
import { Sidebar } from './Sidebar/Sidebar'
import { Viewer } from './Viewer/Viewer'
import { Inspector } from './Inspector/Inspector'
import { StatusBar } from './StatusBar'

export function AppShell(): JSX.Element {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const inspectorOpen = useUiStore((s) => s.inspectorOpen)
  const presentation = useUiStore((s) => s.presentation)

  return (
    <div className={cx('app', presentation && 'is-presentation')}>
      <TitleBar />
      <TabBar />
      <Toolbar />
      <div className="app__body">
        {sidebarOpen && <Sidebar />}
        <Viewer />
        {inspectorOpen && <Inspector />}
      </div>
      <StatusBar />
    </div>
  )
}
