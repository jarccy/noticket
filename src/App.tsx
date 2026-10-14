import { useApp, AppProvider } from '@/context/AppContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { CalendarView } from '@/components/calendar/CalendarView'
import { WebhookView } from '@/components/webhooks/WebhookView'
import { SettingsView } from '@/components/settings/SettingsView'
import { WebhookSimulatorModal } from '@/components/webhooks/WebhookSimulatorModal'
import { ToastContainer } from '@/components/ui/ToastContainer'

function MainContent() {
  const { activeTab } = useApp()

  return (
    <main className="h-dvh flex-1 overflow-y-auto">
      <div key={activeTab} className="mx-auto max-w-6xl animate-fade-in px-6 py-8 md:px-10">
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'webhooks' && <WebhookView />}
        {activeTab === 'settings' && <SettingsView />}
      </div>
    </main>
  )
}

export default function App() {
  return (
    <AppProvider>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground antialiased">
        <Sidebar />
        <MainContent />
        <WebhookSimulatorModal />
        <ToastContainer />
      </div>
    </AppProvider>
  )
}
