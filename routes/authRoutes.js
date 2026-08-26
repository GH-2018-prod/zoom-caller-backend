const express = require('express')
const rateLimit = require('express-rate-limit')
const { registerUser, loginUser, getUser, changePassword, forgotPassword, resetPassword } = require('../controllers/userController')
const { check } = require('express-validator')
const { auth } = require('../middleware/authMiddleware')

const router = express.Router()

// Limite de intentos para frenar fuerza bruta sobre credenciales. Solo
// cuenta los intentos FALLIDOS — un login legitimo repetido (normal en
// desarrollo, o alguien que entra varias veces por dia) nunca deberia
// bloquearse; lo que hay que frenar es una racha de intentos que fallan.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { msg: 'Demasiados intentos, probá de nuevo en unos minutos' },
})

// Registro de usuario
router.post(
  '/register',
  authLimiter,
  [
    check('name', 'El nombre es obligatorio').not().isEmpty(),
    check('email', 'Debe ser un email válido').isEmail(),
    check('password', 'El password debe tener al menos 6 caracteres').isLength({ min: 6 })
  ],
  registerUser
);

// Login de usuario
router.post(
  '/login',
  authLimiter,
  [
    check('email', 'Debe ser un email válido').isEmail(),
    check('password', 'La contraseña es obligatoria').notEmpty(),
  ],
  loginUser
)

// Obtener usuario autenticado
router.get('/me', auth, getUser)

//Change password
router.put('/change-password', auth, changePassword)

// Pedir link de reseteo (autoservicio)
router.post(
  '/forgot-password',
  authLimiter,
  [check('email', 'Debe ser un email válido').isEmail()],
  forgotPassword
)

// Confirmar reseteo con el token del correo
router.post(
  '/reset-password/:token',
  authLimiter,
  [check('password', 'El password debe tener al menos 6 caracteres').isLength({ min: 6 })],
  resetPassword
)

module.exports = router