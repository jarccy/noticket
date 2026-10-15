import { Loader2 } from 'lucide-react'
import { useApp, AppProvider } from '@/context/AppContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { Sidebar } from '@/components/layout/Sidebar'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { CalendarView } from '@/components/calendar/CalendarView'
import { WebhookView } from '@/components/webhooks/WebhookView'
import { SettingsView } from '@/components/settings/SettingsView'
import { GroupsView } from '@/components/groups/GroupsView'
import { canManageGroups } from '@/lib/auth'
import { WebhookSimulatorModal } from '@/components/webhooks/WebhookSimulatorModal'
import { ToastContainer } from '@/components/ui/ToastContainer'

function MainContent() {
  const { activeTab: tab, mode } = useApp()
  const { user } = useAuth()
  // Grupos solo para boss/admin con sesión; si no, se muestra el dashboard
  const activeTab = tab === 'groups' && !(mode === 'cloud' && canManageGroups(user)) ? 'dashboard' : tab

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden lg:h-dvh">
      <div key={activeTab} className="mx-auto max-w-6xl animate-fade-in px-4 py-6 sm:px-6 md:px-10 md:py-8">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'webhooks' && <WebhookView />}
        {activeTab === 'groups' && <GroupsView />}
        {activeTab === 'settings' && <SettingsView />}
      </div>
    </main>
  )
}

/**
 * El login es opcional: sin sesión la app funciona en modo local (localStorage) y con
 * sesión usa la base. La pantalla de acceso se superpone al panel, que sigue montado
 * (y recibiendo webhooks) mientras está abierta.
 */
function Gate() {
  const { status, authOpen } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const mode = status === 'authenticated' ? 'cloud' : 'local'

  return (
    <>
      {/* key: al cambiar de modo se recargan los datos desde su origen */}
      <AppProvider key={mode} mode={mode}>
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground antialiased lg:flex-row">
          <Sidebar />
          <MainContent />
          <WebhookSimulatorModal />
          <ToastContainer />
        </div>
      </AppProvider>
      {authOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <AuthScreen />
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
