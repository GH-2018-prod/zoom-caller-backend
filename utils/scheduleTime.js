const daysMap = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

// Los horarios de clase se cargan en hora de Costa Rica (UTC-6, sin
// horario de verano), pero el servidor (Railway) corre en UTC. Sin esto,
// "07:00" se interpretaba como 07:00 UTC = 1am en Costa Rica, y el
// recordatorio terminaba saltandose a la semana siguiente.
const COSTA_RICA_OFFSET_HOURS = 6

// Misma logica que client/src/helpers/timeStatus.js#getNextMeetingDate,
// portada al backend (no hay codigo compartido entre server y client) y
// ajustada para calcular siempre en hora de Costa Rica, sin importar la
// zona horaria del proceso.
const getNextMeetingDate = (day, time) => {
  // Corremos los componentes UTC para que representen la hora de pared de
  // Costa Rica, calculamos ahi, y al final volvemos a UTC real.
  const nowCR = new Date(Date.now() - COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
  const targetDay = daysMap[day]

  const result = new Date(nowCR)
  result.setUTCHours(0, 0, 0, 0)

  const diff = targetDay - nowCR.getUTCDay()
  result.setUTCDate(nowCR.getUTCDate() + (diff >= 0 ? diff : diff + 7))

  const [hours, minutes] = time.split(':').map(Number)
  result.setUTCHours(hours, minutes, 0, 0)

  return new Date(result.getTime() + COSTA_RICA_OFFSET_HOURS * 60 * 60 * 1000)
}

module.exports = { COSTA_RICA_OFFSET_HOURS, getNextMeetingDate }
