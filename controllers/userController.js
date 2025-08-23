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
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    user = new User({
      name,
      email,
      password: hashedPassword,
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

    //const payload = { id: user.id, role: user.role };
    const payload = { user: { id: user.id, role: user.role,  } };
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
     const userId = req.user; // viene del middleware auth
   console.log(userId)
    
//     const { currentPassword, newPassword } = req.body;

//     // Validar que los campos existan
//     if (!currentPassword || !newPassword) {
//       return res.status(400).json({ msg: 'Todos los campos son obligatorios' });
//     }

//     // Buscar usuario
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ msg: 'Usuario no encontrado' });
//     }

//     // Comparar la contraseña actual
//     const isMatch = await user.comparePassword(currentPassword);
//     if (!isMatch) {
//       return res.status(400).json({ msg: 'Contraseña actual incorrecta' });
//     }

//     // Actualizar con la nueva (se hashea en el pre('save'))
//     user.password = newPassword;
//     console.log("ANTES DE GUARDAR:", user.password);
//     await user.save();
//     console.log("DESPUÉS DE GUARDAR:", user.password);
//     const updatedUser = await User.findById(user.id);
// console.log("EN DB:", updatedUser.password);

//     // Generar nuevo token (para mantener login válido)
//     const token = jwt.sign(
//       { user: { id: user.id, role: user.role } },
//       process.env.JWT_SECRET,
//       { expiresIn: '1h' }
//     );

//     res.json({
//       msg: 'Contraseña actualizada correctamente',
//       token,
//       user: { id: user.id, name: user.name, email: user.email, role: user.role }
//     });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};

// Cambiar contraseña
// const changePassword = async (req, res) => {
//   try {
//     const { currentPassword, newPassword } = req.body;
//     const userId = req.user.id;

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });

//     const isMatch = await user.comparePassword(currentPassword);
//     if (!isMatch) return res.status(400).json({ msg: 'Contraseña actual incorrecta' });

//     user.password = newPassword; // el hash lo hace el pre-save
//     await user.save();

//     res.json({ msg: 'Contraseña actualizada correctamente' });
//   } catch (err) {
//     console.error('Error al cambiar contraseña:', err);
//     res.status(500).json({ msg: 'Error en el servidor' });
//   }
// };



module.exports = { registerUser, loginUser, getUser, getUsers, updateUser, findUser, deleteUser, changePassword };
