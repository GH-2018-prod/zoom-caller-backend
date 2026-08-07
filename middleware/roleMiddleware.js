const adminOnly = (req, res, next) => {
console.log('Verificando acceso admin para:', req.user?.email);
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Acceso denegado: se requiere rol admin' });
  }
};

const teacherOrAdminOnly = (req, res, next) => {
  if (req.user && ['teacher', 'admin'].includes(req.user.role)) {
    next();
  } else {
    return res.status(403).json({ message: 'Acceso denegado: se requiere rol profesor o admin' });
  }
};

module.exports = { adminOnly, teacherOrAdminOnly };
