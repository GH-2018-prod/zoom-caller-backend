const mongoose = require('mongoose');
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
    active: {type: Boolean, default: true},
    // Solo aplica a role:'admin' — un admin que ADEMAS da clases: puede
    // ser elegido como profesor de un horario, marcar asistencia, y en el
    // cliente puede alternar entre la vista de admin y la de profesor
    // desde el menu hamburguesa (ver Profile.jsx#viewMode).
    isTeacher: { type: Boolean, default: false },
    details: {type: Object},
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    // Foto de perfil (avatar del navbar) — separada de Image/la galeria,
    // que es solo para comprobantes de pago. avatarPublicId se guarda para
    // poder borrar la foto vieja de Cloudinary al subir una nueva.
    avatarUrl: { type: String },
    avatarPublicId: { type: String },
  },
  { timestamps: true }
);

// 🔐 Hash automático antes de guardar
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 🔎 Método para comparar contraseñas
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);