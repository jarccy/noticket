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
  parseISO,
} from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Trash2,
  Pencil,
  Tag,
  Radio,
} from 'lucide-react'
import { useApp } from '@/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import type { CalendarEvent, NotificationType } from '@/types'

const CATEGORIES = ['Reunión', 'Despliegue', 'Mantenimiento', 'Alerta', 'Presentación', 'Recordatorio']

export function CalendarView() {
  const { calendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = useApp()
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [showAddModal, setShowAddModal] = useState<boolean>(false)
  // null = creando un evento nuevo; si no, id del evento que se edita
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDate, setFormDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [formTime, setFormTime] = useState('10:00')
  const [formAllDay, setFormAllDay] = useState(false)
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
  const weekDayInitials = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  // Events for selected day
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')
  const selectedDayEvents = calendarEvents.filter((event) => event.date === selectedDateStr)

  const editingEvent = editingId ? calendarEvents.find((c) => c.id === editingId) : undefined
  // Conserva categorías que llegaron por webhook y no están en la lista
  const categories =
    editingEvent && !CATEGORIES.includes(editingEvent.category) ? [...CATEGORIES, editingEvent.category] : CATEGORIES

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const handleToday = () => {
    const now = new Date()
    setCurrentMonth(now)
    setSelectedDate(now)
  }

  const openCreate = (date: string = selectedDateStr) => {
    setEditingId(null)
    setFormTitle('')
    setFormDate(date)
    setFormTime('10:00')
    setFormAllDay(false)
    setFormCategory('Reunión')
    setFormDescription('')
    setFormType('calendar')
    setShowAddModal(true)
  }

  const openEdit = (event: CalendarEvent) => {
    setEditingId(event.id)
    setFormTitle(event.title)
    setFormDate(event.date)
    setFormTime(event.time || '10:00')
    setFormAllDay(!event.time)
    setFormCategory(event.category)
    setFormDescription(event.description ?? '')
    setFormType(event.type)
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingId(null)
  }

  const handleSubmitEvent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle.trim() || !formDate) return

    const fields = {
      title: formTitle.trim(),
      description: formDescription.trim(),
      date: formDate,
      time: formAllDay ? undefined : formTime,
      category: formCategory,
      type: formType,
    }

    if (editingId) {
      updateCalendarEvent(editingId, fields)
    } else {
      addCalendarEvent({ ...fields, source: 'Creado Manualmente' })
    }

    // Si el evento cae en otro día, seguirlo en el calendario
    if (formDate !== selectedDateStr) {
      const d = parseISO(formDate)
      setSelectedDate(d)
      setCurrentMonth(d)
    }
    closeModal()
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
      <PageHeader
        title="Calendario"
        description="Eventos agendados a mano o sincronizados desde webhooks con fecha."
        actions={
        <>
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
            onClick={() => openCreate()}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo evento</span>
          </Button>
        </>
        }
      />

      {/* Main Grid: Calendar on Left, Selected Day Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid (2 cols) */}
        <Card className="lg:col-span-2 border-border/80 shadow-sm p-2 sm:p-4">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {weekDayNames.map((dayName, i) => (
              <div key={dayName} className="text-xs font-semibold text-muted-foreground uppercase py-2">
                <span className="sm:hidden">{weekDayInitials[i]}</span>
                <span className="hidden sm:inline">{dayName}</span>
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
                  onDoubleClick={() => {
                    setSelectedDate(day)
                    openCreate(dayStr)
                  }}
                  aria-label={`${format(day, "d 'de' MMMM", { locale: es })}${dayEvents.length ? `, ${dayEvents.length} evento(s)` : ''}`}
                  className={`min-h-[52px] p-1 sm:min-h-[92px] sm:p-2 rounded-lg sm:rounded-xl text-left transition-all duration-150 flex flex-col justify-between border relative group ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5 dark:bg-primary/10'
                      : isCurrentDay
                      ? 'border-primary/50 bg-muted/40'
                      : isCurrentMonthDay
                      ? 'border-border/60 bg-card hover:border-primary/40 hover:bg-muted/30'
                      : 'border-transparent bg-muted/10 opacity-35 hover:opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-center sm:justify-between w-full">
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
                      <span className="hidden sm:inline text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.2 rounded-full">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Mobile: one dot per event (up to 3) */}
                  {dayEvents.length > 0 && (
                    <div className="flex w-full justify-center gap-0.5 sm:hidden" aria-hidden>
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            ev.type === 'success'
                              ? 'bg-success'
                              : ev.type === 'warning'
                              ? 'bg-warning'
                              : ev.type === 'error'
                              ? 'bg-destructive'
                              : ev.type === 'calendar'
                              ? 'bg-primary'
                              : 'bg-muted-foreground'
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Day Events preview chips */}
                  <div className="hidden sm:block space-y-1 w-full mt-1.5 overflow-hidden">
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
                  <Button variant="outline" size="sm" onClick={() => openCreate()} className="mt-3 gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Agregar Evento</span>
                  </Button>
                </div>
              ) : (
                selectedDayEvents.map((event: CalendarEvent) => (
                  <div
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openEdit(event)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openEdit(event)
                      }
                    }}
                    title="Clic para editar"
                    className="p-3.5 rounded-xl border border-border/80 bg-card/70 hover:border-primary/40 transition-all space-y-2 relative group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEdit(event)
                          }}
                          className="text-muted-foreground/60 hover:text-foreground transition-colors p-1"
                          title="Editar evento"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteCalendarEvent(event.id)
                          }}
                          className="text-muted-foreground/60 hover:text-destructive transition-colors p-1"
                          title="Eliminar evento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
            <Button variant="outline" size="sm" onClick={() => openCreate()} className="w-full gap-2 border-dashed">
              <Plus className="h-4 w-4" />
              <span>Programar Evento para este Día</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* Modal: crear / editar evento */}
      <Dialog open={showAddModal} onOpenChange={(open) => (open ? setShowAddModal(true) : closeModal())}>
        <DialogContent onClose={closeModal}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? <Pencil className="h-5 w-5 text-primary" /> : <CalendarIcon className="h-5 w-5 text-primary" />}
              {editingId ? 'Editar evento' : 'Nuevo evento'}
            </DialogTitle>
            <DialogDescription>
              {!editingId
                ? 'Programa un evento manual en el calendario.'
                : editingEvent?.webhookId
                ? 'Este evento llegó por webhook. Si se re-envía ese mismo webhook, se sobrescribirán tus cambios.'
                : 'Modifica los datos del evento.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitEvent} className="space-y-4 pt-2">
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
                  <CalendarIcon className="h-3 w-3" /> Fecha *
                </label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Hora
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={formAllDay}
                      onChange={(e) => setFormAllDay(e.target.checked)}
                      className="h-3 w-3 accent-primary"
                    />
                    Todo el día
                  </label>
                </div>
                <Input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  disabled={formAllDay}
                />
              </div>
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
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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

            <DialogFooter className="sm:justify-between">
              {editingId ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    deleteCalendarEvent(editingId)
                    closeModal()
                  }}
                  className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  {editingId ? 'Guardar cambios' : 'Crear evento'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
