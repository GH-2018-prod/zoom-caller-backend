const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Asegúrate de que sea la ruta correcta

const protect = async (req, res, next) => {
  let token;

  // Verificar si hay header de autorización con formato Bearer
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Obtener el usuario del token y agregarlo a req.user (sin la contraseña)
      req.user = await User.findById(decoded.user.id).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Usuario no encontrado' });
      }

      next(); // Todo ok, seguir al siguiente middleware
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Token no válido' });
    }
  } else {
    // Si no hay Authorization header
    return res.status(401).json({ message: 'No autorizado, sin token' });
  }
};

module.exports = { protect };
