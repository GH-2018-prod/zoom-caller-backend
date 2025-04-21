const express = require('express');
const { registerUser, loginUser, getUser } = require('../controllers/userController');
const { check } = require('express-validator');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// Registro de usuario
router.post(
  '/register',
  [
    check('name', 'El nombre es obligatorio').not().isEmpty(),
    check('email', 'Debe ser un email válido').isEmail(),
    check('password', 'El password debe tener al menos 6 caracteres').isLength({ min: 6 })
  ],
  registerUser
);

// Login de usuario
router.post('/login', loginUser);

// Obtener usuario autenticado
router.get('/me', auth, getUser);

module.exports = router;