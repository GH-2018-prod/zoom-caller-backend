const User = require('../models/User')

// Busca si algun estudiante (menos el que se esta editando, si aplica) ya
// tiene una clase con ese profesor en ese dia+hora exacto — un profesor no
// puede dar dos clases distintas al mismo tiempo. Devuelve el estudiante en
// conflicto (para armar un mensaje claro) o null si esta libre.
const findTeacherConflict = async (teacherId, day, time, excludeStudentId = null) => {
  if (!teacherId || !day || !time) return null

  const query = {
    role: 'student',
    'details.schedule': { $elemMatch: { teacherId: String(teacherId), day, time } },
  }
  if (excludeStudentId) {
    query._id = { $ne: excludeStudentId }
  }

  return User.findOne(query).select('name')
}

module.exports = { findTeacherConflict }
