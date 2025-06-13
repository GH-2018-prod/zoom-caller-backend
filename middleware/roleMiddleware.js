const adminOnly = (req, res, next) => {
console.log('Verificando acceso admin para:', req.user?.email);
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Acceso denegado: se requiere rol admin' });
  }
};

module.exports = { adminOnly };
