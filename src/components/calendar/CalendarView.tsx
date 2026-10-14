import { useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Trash2,
  Tag,
  Radio,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { CalendarEvent, NotificationType } from '@/types'

export function CalendarView() {
  const { calendarEvents, addCalendarEvent, deleteCalendarEvent } = useApp()
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [showAddModal, setShowAddModal] = useState<boolean>(false)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formTime, setFormTime] = useState('10:00')
  const [formCategory, setFormCategory] = useState('Reunión')
  const [formDescription, setFormDescription] = useState('')
  const [formType, setFormType] = useState<NotificationType>('calendar')

  // Date math
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(monthStart)
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }) // Monday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: startDate, end: endDate })

  const weekDayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  // Events for selected day
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')
  const selectedDayEvents = calendarEvents.filter((event) => event.date === selectedDateStr)

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const handleToday = () => {
    const now = new Date()
    setCurrentMonth(now)
    setSelectedDate(now)
  }

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim()) return

    addCalendarEvent({
      title: formTitle.trim(),
      description: formDescription.trim(),
      date: selectedDateStr,
      time: formTime,
      category: formCategory,
      type: formType,
      source: 'Creado Manualmente',
    })

    setFormTitle('')
    setFormDescription('')
    setShowAddModal(false)
  }

  const getEventBadgeColor = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'bg-success/10 text-success border-success/30'
      case 'warning':
        return 'bg-warning/10 text-warning border-warning/30'
      case 'error':
        return 'bg-destructive/10 text-destructive border-destructive/30'
      case 'calendar':
        return 'bg-primary/10 text-primary border-primary/30'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            Calendario de Eventos & Webhooks
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualiza eventos agendados, reuniones y tareas sincronizadas automáticamente mediante webhooks JSON.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Hoy
          </Button>
          <div className="flex items-center border border-border rounded-lg bg-card p-0.5">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-semibold capitalize min-w-[130px] text-center">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Evento</span>
          </Button>
        </div>
      </div>

      {/* Main Grid: Calendar on Left, Selected Day Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid (2 cols) */}
        <Card className="lg:col-span-2 border-border/80 shadow-sm p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {weekDayNames.map((dayName) => (
              <div key={dayName} className="text-xs font-semibold text-muted-foreground uppercase py-2">
                {dayName}
              </div>
            ))}
          </div>

          {/* Days cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dayStr = format(day, 'yyyy-MM-dd')
              const dayEvents = calendarEvents.filter((e) => e.date === dayStr)
              const isSelected = isSameDay(day, selectedDate)
              const isCurrentMonthDay = isSameMonth(day, currentMonth)
              const isCurrentDay = isToday(day)

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={`min-h-[92px] p-2 rounded-xl text-left transition-all duration-150 flex flex-col justify-between border relative group ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5 dark:bg-primary/10'
                      : isCurrentDay
                      ? 'border-primary/50 bg-muted/40'
                      : isCurrentMonthDay
                      ? 'border-border/60 bg-card hover:border-primary/40 hover:bg-muted/30'
                      : 'border-transparent bg-muted/10 opacity-35 hover:opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs font-semibold rounded-full h-6 w-6 flex items-center justify-center ${
                        isCurrentDay
                          ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                          : isSelected
                          ? 'text-primary font-bold'
                          : 'text-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.2 rounded-full">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Day Events preview chips */}
                  <div className="space-y-1 w-full mt-1.5 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`text-[10px] truncate px-1.5 py-0.5 rounded border font-medium ${getEventBadgeColor(
                          ev.type
                        )}`}
                        title={`${ev.time ? ev.time + ' - ' : ''}${ev.title}`}
                      >
                        {ev.time ? `${ev.time} ` : ''}
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] text-muted-foreground font-medium pl-1">
                        +{dayEvents.length - 2} más...
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Selected Day Agenda Panel (1 col) */}
        <Card className="border-border/80 shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-border/70">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold capitalize">
                    {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {selectedDayEvents.length === 0
                      ? 'No hay eventos programados'
                      : `${selectedDayEvents.length} evento(s) agendado(s)`}
                  </CardDescription>
                </div>
                {isToday(selectedDate) && (
                  <Badge variant="default" className="text-[10px]">
                    Hoy
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3 max-h-[460px] overflow-y-auto">
              {selectedDayEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <CalendarIcon className="h-10 w-10 mx-auto opacity-30" />
                  <p className="text-sm font-medium">Día libre de eventos</p>
                  <p className="text-xs max-w-xs mx-auto">
                    Puedes programar un evento manual o enviar un webhook con la propiedad{' '}
                    <code className="text-primary font-mono text-[11px]">&quot;date&quot;: &quot;{selectedDateStr}&quot;</code>.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddModal(true)}
                    className="mt-3 gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Agregar Evento</span>
                  </Button>
                </div>
              ) : (
                selectedDayEvents.map((event: CalendarEvent) => (
                  <div
                    key={event.id}
                    className="p-3.5 rounded-xl border border-border/80 bg-card/70 hover:border-primary/40 transition-all space-y-2 relative group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${getEventBadgeColor(
                              event.type
                            )}`}
                          >
                            {event.category}
                          </span>
                          {event.webhookId && (
                            <Badge variant="outline" className="text-[9px] gap-1 px-1.5 py-0 border-primary/30 text-primary">
                              <Radio className="h-2.5 w-2.5 animate-pulse" />
                              Webhook
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-foreground pt-1">{event.title}</h4>
                      </div>

                      <button
                        onClick={() => deleteCalendarEvent(event.id)}
                        className="text-muted-foreground/60 hover:text-destructive transition-colors p-1"
                        title="Eliminar evento"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {event.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-primary" />
                        {event.time || 'Todo el día'}
                      </span>
                      {event.source && <span className="font-mono text-[10px]">{event.source}</span>}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </div>

          <div className="p-4 border-t border-border/70 bg-muted/20 rounded-b-xl">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="w-full gap-2 border-dashed"
            >
              <Plus className="h-4 w-4" />
              <span>Programar Evento para este Día</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* Modal: Add Event */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent onClose={() => setShowAddModal(false)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              Nuevo Evento de Calendario
            </DialogTitle>
            <DialogDescription>
              Programar un evento para el día {format(selectedDate, "d 'de' MMMM yyyy", { locale: es })}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateEvent} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Título del Evento *</label>
              <Input
                placeholder="Ej. Revisión trimestral de seguridad"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Hora
                </label>
                <Input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Categoría
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="Reunión">Reunión</option>
                  <option value="Despliegue">Despliegue</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                  <option value="Alerta">Alerta</option>
                  <option value="Presentación">Presentación</option>
                  <option value="Recordatorio">Recordatorio</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Prioridad / Nivel</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'calendar', label: 'Normal' },
                  { id: 'success', label: 'Éxito' },
                  { id: 'warning', label: 'Atención' },
                  { id: 'error', label: 'Crítico' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormType(item.id as NotificationType)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-all ${
                      formType === item.id
                        ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                        : 'border-border bg-card hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Descripción o Notas</label>
              <textarea
                placeholder="Detalles adicionales del evento..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Guardar Evento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
