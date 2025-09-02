const User = require('../models/User')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { validationResult } = require('express-validator')
const { sendWelcomeEmail } = require('../utils/emailService')

// Registrar usuario
const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, email, password, role, active, details } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });
    user = new User({
      name,
      email,
      password,
      role: role || 'student',
      active: active ?? true,
      details: details || {},
    });
    await user.save();

    // ✅ Enviar correo de bienvenida sin bloquear la respuesta
    sendWelcomeEmail(user.email, user.name)
      .then(() => console.log(`✉️ Correo enviado a ${user.email}`))
      .catch(err => console.error(`❌ Error al enviar correo a ${user.email}:`, err));

    const payload = { user: { id: user.id, role: user.role,  } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, details: user.details }
      //user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Error en registerUser:', error);
    res.status(500).send('Error en el servidor');
  }
};

// Iniciar sesión
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Credenciales inválidas(no user found)' });

    const isMatch = await user.comparePassword(password);
if (!isMatch) return res.status(400).json({ msg: 'Credenciales inválidas (contraseña)' });

    const payload = { user: { id: user.id, role: user.role,  } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '365d' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, details: user.details } });
  } catch (error) {
    console.error('Error en loginUser:', error);
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

const getUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Actualizar usuario
const updateUser = async (req, res) => {
  const { id } = req.params;

  try {
    const updatedUser = await User.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });

    if (!updatedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar el usuario' });
  }
};

// Borrar usuario
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.status(200).json({ message: 'Usuario eliminado correctamente', user: deletedUser });
  } catch (error) {
    console.error('Error al eliminar el usuario:', error);
    res.status(500).json({ message: 'Error al eliminar el usuario' });
  }
};


// Actualizar usuario
const findUser = async (req, res) => {
  try {
    const { id } = req.params;
    const users = await User.findById( id );
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Cambiar contraseña
const changePassword = async (req, res) => {
  
  try {
    const userId = req.user.id; // viene del middleware auth
    
    const { currentPassword, newPassword } = req.body;

    // Validar que los campos existan
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: 'Todos los campos son obligatorios' });
    }

    // Buscar usuario
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'Usuario no encontrado' });
    }

    // Comparar la contraseña actual
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Contraseña actual incorrecta' });
    }

    // Actualizar con la nueva (se hashea en el pre('save'))
    user.password = newPassword;
    await user.save();

    // Generar nuevo token (para mantener login válido)
    const token = jwt.sign(
      { user: { id: user.id, role: user.role } },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      msg: 'Contraseña actualizada correctamente',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};

module.exports = { registerUser, loginUser, getUser, getUsers, updateUser, findUser, deleteUser, changePassword };
