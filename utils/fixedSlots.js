// Horarios fijos disponibles para reprogramar (MVP: no cruza disponibilidad
// real del profesor contra el resto de sus estudiantes, eso queda para
// mas adelante). Espejado en client/src/helpers/fixedSlots.js.
const FIXED_SLOTS = [
  { day: 'Monday', time: '17:00' },
  { day: 'Thursday', time: '11:00' },
  { day: 'Thursday', time: '15:00' },
  { day: 'Thursday', time: '18:00' },
  { day: 'Friday', time: '11:00' },
  { day: 'Friday', time: '15:00' },
  { day: 'Friday', time: '18:00' },
]

const isFixedSlot = (day, time) =>
  FIXED_SLOTS.some((slot) => slot.day === day && slot.time === time)

module.exports = { FIXED_SLOTS, isFixedSlot }
