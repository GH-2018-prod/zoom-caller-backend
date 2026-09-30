const RescheduleSlot = require('../models/RescheduleSlot')
const { computeWeeklyOccurrences } = require('./weeklyOccurrences')

// Cuantos estudiantes tiene EFECTIVAMENTE un profesor+dia+hora esta
// semana — ya resuelto contra reprogramaciones y cancelaciones via
// computeWeeklyOccurrences, asi que un cupo cancelado esta semana no
// cuenta, y uno reprogramado hacia aca si. excludeStudentId: para volver a
// chequear sin contar al propio estudiante que se esta moviendo (si ya
// estaba en ese horario, no deberia bloquearse a si mismo).
const getOccupancy = async (teacherId, day, time, excludeStudentId = null) => {
  const { occurrences } = await computeWeeklyOccurrences()
  const excludeId = excludeStudentId ? String(excludeStudentId) : null

  return occurrences.filter(
    (o) =>
      o.teacherId === String(teacherId) &&
      o.day === day &&
      o.time === time &&
      o.studentId !== excludeId
  ).length
}

// Capacidad del horario — si no existe un RescheduleSlot formal para ese
// profesor+dia+hora (asignacion manual del admin sin pasar por el
// selector), se asume 1 para no permitir un doble-booking accidental.
const getCapacity = async (teacherId, day, time) => {
  const slot = await RescheduleSlot.findOne({ teacherId, day, time }).select('capacity')
  return slot?.capacity ?? 1
}

// Chequeo combinado que usan las rutas de reserva.
const hasCapacity = async (teacherId, day, time, excludeStudentId = null) => {
  const [occupancy, capacity] = await Promise.all([
    getOccupancy(teacherId, day, time, excludeStudentId),
    getCapacity(teacherId, day, time),
  ])
  return { hasRoom: occupancy < capacity, occupancy, capacity }
}

module.exports = { getOccupancy, getCapacity, hasCapacity }
