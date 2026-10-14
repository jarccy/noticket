import { useApp, AppProvider } from '@/context/AppContext'
import { Header } from '@/components/layout/Header'
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
    <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-background/50 h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto">
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
      <div className="min-h-screen bg-background text-foreground flex flex-col antialiased selection:bg-primary/20 selection:text-primary">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>
        <WebhookSimulatorModal />
        <ToastContainer />
      </div>
    </AppProvider>
  )
}
