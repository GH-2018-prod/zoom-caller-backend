const crypto = require('crypto')
const User = require('../models/User')
const Image = require('../models/Image')
const ScheduleChange = require('../models/ScheduleChange')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const cloudinary = require('cloudinary').v2
const { validationResult } = require('express-validator')
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/emailService')
const { findTeacherConflict } = require('../utils/teacherConflict')
const { dayLabels } = require('../utils/dayLabels')

// Tokens de larga duracion (antes 365d) sin refresh token detras.
// Configurable via env para poder ajustarlo sin tocar codigo.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d'

// Registrar usuario
const registerUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, email, password, role, active, details } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

    // Un profesor no puede quedar con dos clases distintas al mismo
    // dia+hora — se valida ANTES de crear al estudiante.
    for (const entry of details?.schedule || []) {
      if (!entry.day || !entry.time || !entry.teacherId) continue
      const conflict = await findTeacherConflict(entry.teacherId, entry.day, entry.time)
      if (conflict) {
        return res.status(400).json({
          msg: `Ese profesor ya tiene clase el ${dayLabels[entry.day]} a las ${entry.time} (con ${conflict.name})`,
        })
      }
    }

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
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
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
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Credenciales inválidas(no user found)' });

    const isMatch = await user.comparePassword(password);
if (!isMatch) return res.status(400).json({ msg: 'Credenciales inválidas (contraseña)' });

    const payload = { user: { id: user.id, role: user.role,  } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Estudiantes de UN profesor puntual (no todos los usuarios de la
// academia). A diferencia de getUsers (admin-only), esto es lo que un
// profesor puede llamar sin ver datos de estudiantes que no son suyos.
// El profesor es por horario (details.schedule[].teacherId), no por
// estudiante — se busca tanto ahi como en el viejo details.teacherId
// (estudiantes creados antes de este cambio que todavia no se editaron).
const getMyStudents = async (req, res) => {
  try {
    const teacherId = req.user.id;

    // Una clase reprogramada hacia un horario habilitado por ESTE profesor
    // pasa a ser suya (aunque el estudiante sea originalmente de otro
    // profesor) — hay que traer tambien a esos estudiantes, y recordar cual
    // entrada puntual (dia+hora original) quedo reasignada.
    const reassignments = await ScheduleChange.find({
      action: 'rescheduled',
      newTeacherId: teacherId,
      originalDate: { $gte: new Date() },
    }).select('studentId originalDay originalTime');

    const reassignedStudentIds = reassignments.map((r) => r.studentId.toString());
    const reassignedKeysByStudent = {};
    reassignments.forEach((r) => {
      const sid = r.studentId.toString();
      if (!reassignedKeysByStudent[sid]) reassignedKeysByStudent[sid] = new Set();
      reassignedKeysByStudent[sid].add(`${r.originalDay}__${r.originalTime}`);
    });

    const students = await User.find({
      role: 'student',
      $or: [
        { 'details.teacherId': teacherId },
        { 'details.schedule.teacherId': teacherId },
        { _id: { $in: reassignedStudentIds } },
      ],
    }).select('-password');

    // Un estudiante puede compartirse entre varios profesores (una entrada
    // de horario por profesor). Ademas de encontrar al estudiante, hay que
    // recortar su horario a solo las entradas de ESTE profesor (directas o
    // reasignadas por reprogramacion) — si no, la respuesta le manda al
    // profesor las clases (y el nombre) del otro profesor con el mismo
    // estudiante, rompiendo la privacidad entre profesores aunque el
    // frontend despues no las muestre.
    const scoped = students.map((student) => {
      const obj = student.toObject();
      const schedule = obj.details?.schedule || [];
      const legacyTeacherId = obj.details?.teacherId;
      const reassignedKeys = reassignedKeysByStudent[obj._id.toString()] || new Set();
      obj.details = {
        ...obj.details,
        schedule: schedule.filter((entry) => {
          const ownsDirectly = entry.teacherId
            ? entry.teacherId === teacherId
            : legacyTeacherId === teacherId;
          const reassignedToMe = reassignedKeys.has(`${entry.day}__${entry.time}`);
          return ownsDirectly || reassignedToMe;
        }),
      };
      return obj;
    });

    res.status(200).json(scoped);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// Actualizar usuario
const updateUser = async (req, res) => {
  const { id } = req.params;

  try {
    const updates = { ...req.body };

    // Contrasena opcional (reset asistido por admin) — findByIdAndUpdate
    // no dispara el pre('save') que hashea, asi que se hashea ac a mano
    // si vino una nueva. Si vino vacia/ausente, no se toca la existente.
    if (updates.password) {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    } else {
      delete updates.password;
    }

    // Un profesor no puede quedar con dos clases distintas al mismo
    // dia+hora — se excluye al propio estudiante para no chocar contra sus
    // propias entradas sin cambios.
    for (const entry of updates.details?.schedule || []) {
      if (!entry.day || !entry.time || !entry.teacherId) continue
      const conflict = await findTeacherConflict(entry.teacherId, entry.day, entry.time, id)
      if (conflict) {
        return res.status(400).json({
          message: `Ese profesor ya tiene clase el ${dayLabels[entry.day]} a las ${entry.time} (con ${conflict.name})`,
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

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
    // Antes de borrar al usuario, borrar sus imagenes (comprobantes) tanto
    // de Cloudinary como de Mongo — si no, quedan huerfanas: ocupando
    // espacio en Cloudinary para siempre y rompiendo la Galeria al
    // intentar mostrar un "user" que ya no existe.
    const images = await Image.find({ user: id });
    for (const image of images) {
      try {
        await cloudinary.uploader.destroy(image.public_id);
      } catch (cloudinaryError) {
        console.error('Error borrando imagen de Cloudinary:', cloudinaryError.message);
      }
    }
    await Image.deleteMany({ user: id });

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
    const users = await User.findById(id).select('-password');
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

// Pedir link de reseteo (autoservicio, desde "olvidé mi contraseña")
const forgotPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { email } = req.body
    const user = await User.findOne({ email })

    // Respuesta genérica siempre, exista o no el email — si no, cualquiera
    // podría usar este endpoint para averiguar qué correos están registrados.
    const genericResponse = {
      msg: 'Si el correo está registrado, vas a recibir un link para restablecer tu contraseña.',
    }

    if (!user) {
      return res.json(genericResponse)
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    // Se guarda el hash del token, no el token en si — igual que una
    // contraseña, para que una fuga de la base de datos no alcance para
    // resetear cuentas.
    user.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex')
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000 // 1 hora
    await user.save()

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${rawToken}`
    await sendPasswordResetEmail(user.email, user.name, resetLink)

    res.json(genericResponse)
  } catch (error) {
    console.error('Error en forgotPassword:', error)
    res.status(500).json({ msg: 'Error en el servidor' })
  }
}

// Confirmar reseteo con el token recibido por correo
const resetPassword = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { token } = req.params
    const { password } = req.body

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    })

    if (!user) {
      return res.status(400).json({ msg: 'El link es inválido o ya expiró' })
    }

    user.password = password // se hashea en el pre('save')
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    res.json({ msg: 'Contraseña actualizada correctamente' })
  } catch (error) {
    console.error('Error en resetPassword:', error)
    res.status(500).json({ msg: 'Error en el servidor' })
  }
}

module.exports = { registerUser, loginUser, getUser, getUsers, getMyStudents, updateUser, findUser, deleteUser, changePassword, forgotPassword, resetPassword };
