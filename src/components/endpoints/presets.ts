import type { FieldMapping } from '@/types'

/** Plantillas para crear un endpoint con el mapeo ya preparado para servicios conocidos. */
export interface EndpointPreset {
  id: string
  name: string
  description: string
  /** Iniciales del distintivo de la tarjeta. */
  mark: string
  mapping: FieldMapping
  sample: Record<string, unknown>
}

export const PRESETS: EndpointPreset[] = [
  {
    id: 'blank',
    name: 'En blanco',
    description: 'Detección automática de title, message, type, date…',
    mark: '{}',
    mapping: {},
    sample: {
      title: 'Copia de seguridad completada',
      message: 'Se guardaron 1.284 archivos (3,2 GB)',
      type: 'success',
      source: 'Servidor NAS',
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Push, pull requests e issues de un repositorio',
    mark: 'GH',
    mapping: {
      // Solo uno de los tres existe según el evento: los otros quedan vacíos
      title: '{{repository.full_name}} {{action}}',
      message: '{{head_commit.message}}{{pull_request.title}}{{issue.title}}',
      source: 'sender.login',
      category: 'action',
    },
    sample: {
      action: 'opened',
      repository: { full_name: 'acme/app' },
      pull_request: { title: 'Arreglar el bucle de redirección del login', number: 42 },
      sender: { login: 'octocat' },
    },
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Pagos y suscripciones (payment_intent.succeeded, charge.failed…)',
    mark: 'S',
    mapping: {
      title: 'Stripe · {{type}}',
      message: '{{data.object.description}} — {{data.object.amount}} {{data.object.currency}}',
      type: 'type',
      category: 'type',
    },
    sample: {
      type: 'payment_intent.succeeded',
      data: { object: { description: 'Plan Pro mensual', amount: 1900, currency: 'eur' } },
    },
  },
  {
    id: 'calendar',
    name: 'Agenda',
    description: 'Citas y reuniones: se añaden solas al calendario',
    mark: 'AG',
    mapping: {
      title: 'event.summary',
      message: '{{event.location}} · {{event.organizer}}',
      date: 'event.date',
      time: 'event.time',
    },
    sample: {
      event: { summary: 'Revisión trimestral', location: 'Sala 2', organizer: 'Ana', date: '2026-11-20', time: '10:30' },
    },
  },
]

/** Iniciales para el distintivo de un endpoint («Servidor NAS» → «SN»). */
export function endpointMark(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2)).toUpperCase() || '··'
}
