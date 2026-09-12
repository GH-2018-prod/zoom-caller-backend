// Un admin con isTeacher:true puede hacer todo lo que hace un profesor
// (marcar asistencia, ser elegido como profesor de un horario) ademas de
// sus permisos de admin — ver client/src/pages/Profile.jsx (viewMode) para
// el toggle de UI correspondiente en el cliente.
const isTeacherLike = (user) =>
  Boolean(user) && (user.role === 'teacher' || (user.role === 'admin' && user.isTeacher))

module.exports = { isTeacherLike }
