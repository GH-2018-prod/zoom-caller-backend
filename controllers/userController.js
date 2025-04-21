const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Registrar usuario
const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, password, role, active, details } = req.body;


  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      active,
      details,
    });

    await user.save();

    const payload = { user: { id: user.id, role: user.role,  } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, details: user.details } });

  } catch (error) {
    res.status(500).send('Error en el servidor');
  }
};

// Iniciar sesión
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Credenciales inválidas' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Credenciales inválidas' });

    const payload = { user: { id: user.id, role: user.role } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, details: user.details } });
  } catch (error) {
    res.status(500).send('Error en el servidor');
  }
};

// Obtener usuario autenticado
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).send('Error en el servidor');
  }
};

module.exports = { registerUser, loginUser, getUser };
