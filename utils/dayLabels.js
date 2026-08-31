// Los dias se guardan en ingles en toda la base (User.details.schedule,
// ScheduleChange, RescheduleSlot) porque asi arranco el proyecto, pero
// cualquier texto que le llegue al usuario (mensajes de error, push) tiene
// que mostrarse en espanol — este mapa es el punto unico de traduccion del
// lado del servidor.
const dayLabels = {
  Sunday: 'domingo',
  Monday: 'lunes',
  Tuesday: 'martes',
  Wednesday: 'miércoles',
  Thursday: 'jueves',
  Friday: 'viernes',
  Saturday: 'sábado',
}

module.exports = { dayLabels }
